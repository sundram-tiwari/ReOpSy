# Build playbook — ReOpSy v2

Run these in order with your AI coding agent, from the repo root. Use one session per phase (or `/clear` between
phases). Each prompt is self-contained. Every phase ends with tests green and a commit on a
`replan/*` branch that you review before merging.

**Standing rules (paste once into the agent's project instructions file before Phase 0):**

```markdown
## ReOpSy v2 rules
- Source of truth: docs/replan/PRODUCT-SPEC.md. If code and spec disagree, ask.
- Never commit secrets. Keys live in GitHub Actions secrets or .env (gitignored).
- Pipeline code: Node 20, CommonJS, zero runtime deps except @huggingface/transformers. Tests with node --test.
- App code: Expo SDK 57, TypeScript strict. `npm run typecheck` and `npm test` must pass.
- LLMs never produce links, DOIs or IDs. Links are built from source identifiers only.
- Before deleting tracked files, list them and ask.
```

---

## Phase 0: Safety tag and repo hygiene (½ day)

```
Read docs/replan/PRODUCT-SPEC.md section 3 (kill list).
1. Create git tag `pre-replan` on the current main and a branch `replan/p0-hygiene`.
2. Untrack (git rm --cached, keep files on disk) .agents/, app/testbuild/, tests/scratch_db/.
   Add them to .gitignore. Show me the list before running.
3. Write docs/replan/DECISIONS.md, a short ADR log. Seed it with: static CDN instead of Render,
   catalog topics instead of hardcoded, Topics instead of Concepts, local embeddings, and no
   client-side LLM keys.
4. Do NOT delete any source code yet. That happens in the phase that replaces it.
Acceptance: `git status` clean after commit; app typecheck and backend tests still pass.
```

## Phase 1: Measure first, with a feed audit and gold set (1 day)

```
Build tools/feed-audit/ (Node, no deps):
1. audit.js: reads any feed JSON (current app/src/data/dailyFeed.json or a v2 shard) and reports
   per topic: count, % summaries ending in "…", % headline==original title, % future dates,
   % placeholder/embargo abstracts, and keyword precision using requiredTerms from the catalog.
   Run it on the current dailyFeed.json. Expected baseline: 47 cards, 47/47 title unchanged,
   32/47 truncated, ~17/47 on-topic.
2. gold.js: CLI that pulls 40 recent candidates per topic (arXiv + OpenAlex) and writes
   tools/feed-audit/gold/{slug}.csv with columns id,title,abstract_snippet,label (blank) for me
   to hand-label 1 = relevant / 0 = not.
3. precision.js: given a ranked list + gold CSV, prints precision@10 and the false positives.
Acceptance: unit tests for each metric; README showing how I label the gold set.
```

> **You:** label at least 20 papers per topic in the gold CSVs. You are the domain expert, and
> this is the most valuable hour in the project.

## Phase 2: Topic catalog v2 (1 day)

```
Replace backend/ingest/lib/topics.js and app/src/config.ts topics with a single catalog:
catalog/topics.json following TopicDef in PRODUCT-SPEC.md section 5.
1. Write tools/resolve-topics.js. For each topic label, query the OpenAlex /topics endpoint
   (API key from env OPENALEX_API_KEY; key is free at openalex.org/settings/api) and print
   candidate topic IDs with display_name, subfield and works_count, so I can choose. Do NOT use
   concepts.id. Concepts are deprecated and frozen.
2. Fill the 5 current topics with: openalexTopicIds, arxivCategories, requiredTerms,
   excludeTerms, europePmcQuery (mental health + autism), and seedPapers (I will supply
   5-10 IDs per topic; leave TODO markers).
3. Generate app/src/catalog.generated.ts from catalog/topics.json at build time.
Acceptance: schema validation test for every catalog entry; "AI in Mental Health" and
"Autism Diagnosis" no longer share any filter.
```

## Phase 3: Source adapters and quality gates (2 days)

```
Rewrite the fetch layer in backend/ingest/lib/ (keep the zero-dependency style):
- openalex.js: works filtered by topics.id, from_publication_date, to_publication_date=today,
  has_abstract:true, is_retracted:false, type:article|preprint; api_key param; read cost
  headers and log daily usage; reconstruct abstract from abstract_inverted_index (existing code).
- arxiv.js: export.arxiv.org API by category + query, sorted by submittedDate; enforce 1 request
  per 3 s and one connection; parse the comment field (pages, venue, code links).
- europepmc.js: REST search for biomedical topics, preprints + peer-reviewed, last 3 days.
- biorxiv.js: api.biorxiv.org details endpoint by date range for bio/medRxiv.
- crossref.js: polite pool (mailto), look up `update-to` for retractions on DOIs we publish.
- unpaywall.js: best OA location per DOI (email param).
- gates.js: hard gates from PRODUCT-SPEC section 6 step 3, each a pure function with tests,
  including fixtures for the 3 beforeExamples in docs/replan/data/sample-cards.json
  (embargo text, year 2027/2029, Zenodo self-deposit). All 3 must be rejected.
- dedupe.js: DOI → arXiv ID → normalized title hash.
Acceptance: node --test green; `node ingest/candidates.js --topic autism-diagnosis --dry`
prints candidates with gate decisions and reasons.
```

## Phase 4: Relevance ranking with local embeddings (1–2 days)

```
Add backend/ingest/lib/rank.js using @huggingface/transformers (Node, CPU) with
Xenova/bge-small-en-v1.5 (or all-MiniLM-L6-v2 if bge is too slow). Cache the model in the
Actions cache.
- Topic profile = mean embedding of seedPapers (title+abstract) + description.
- score = cosine(candidate, profile); keep if score ≥ threshold AND hits ≥1 requiredTerm,
  or score ≥ strongScore.
- Add 1 serendipity pick per topic from the next-best adjacent topic, flagged.
- Produce `whyShown` text from the matched terms + nearest seed paper title.
- Tune thresholds per topic with tools/feed-audit/precision.js against my gold labels.
Acceptance: precision@10 ≥ 0.8 on each labelled topic (print the table), runtime < 10 min in
Actions for 5 topics.
```

## Phase 5: Summarizer v2 (2 days)

```
Replace backend/pipeline/llm.js title rewriting with summarize-v2:
- Prompt returns JSON {headline, problem, approach, result, limits, keyNumbers[]}.
  promptVersion constant 'sum-v2.0'. Include 2 few-shot examples taken from
  docs/replan/data/sample-cards.json.
- validators.js (pure, tested): headline ≤12 words, no '?', banned hype list (revolutionary,
  groundbreaking, game-changer, shocking, you won't believe…), total 45–70 words, every number in
  output appears in the abstract (normalize unicode dashes, %, decimals), no URLs, limits
  non-empty, no first-person.
- On validation failure: one retry with the error list; then extractive fallback (whole
  sentences only, strip LaTeX, never end with "…").
- Provider chain with per-provider daily budgets and 429 backoff: Groq (llama-3.3-70b) →
  Gemini Flash-Lite → OpenRouter :free → extractive. Log provider + outcome to the run report.
- Cache: summaries/{id}@{promptVersion}.json committed to a data branch (or R2), so a paper is
  never summarized twice.
Acceptance: run on 30 real papers; print validator pass rate (target ≥95%), show 5 outputs
side by side with abstracts for my review.
```

## Phase 6: Static publishing and nightly automation; retire Render (1 day)

```
1. backend/ingest/publish.js writes /v2/manifest.json, /v2/catalog.json,
   /v2/topics/{slug}/{date}.json, /v2/papers/{id}.json and a ≤20-card offline seed into
   app/assets/seed.json. Keep 30 days rolling.
2. .github/workflows/nightly.yml: test → candidates → gates → rank → summarize → publish to
   Cloudflare Pages via wrangler (secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
   OPENALEX_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, CONTACT_EMAIL).
   Keep the existing failure-issue job. Post the audit table to the job summary.
3. After one successful published run, remove (asking me first): backend/server.js webhook,
   backend/pipeline/cron.js, backend/db/, sqlite3 + node-cron + firebase-admin deps if unused,
   backend/schema.sql, render.yaml, old ingest.yml Supabase steps, semanticScholar.js.
Acceptance: manifest reachable at the Pages URL; feed audit on the published shards shows
0 truncated summaries, 0 future dates, precision table ≥ 0.8.
```

## Phase 7: App data layer, local-first (2 days)

```
In app/src:
- services/feedClient.ts: fetch manifest + today's shards for followed topics, ETag caching,
  fallback to assets/seed.json offline. Delete feedService.ts's Firestore feed read.
- db/: expo-sqlite schema from PRODUCT-SPEC section 7 + migration from the AsyncStorage key
  'reopsy_v2_state' (saved papers, streak, followed topics) so existing testers lose nothing.
- Keep Firebase Auth + users/{uid} sync, but make it optional and additive (merge, never wipe).
- Remove customTopicFetcher.ts, apiValidator.ts, UserApiConfig and the Settings UI for API keys.
Acceptance: typecheck + tests; airplane-mode test shows yesterday's deck and library.
```

## Phase 8: Core UI from the design handoff (3–4 days)

```
Read docs/replan/design/tokens.json and components.md (from the design tool). Replace theme.ts
with generated tokens (light + dark). Build:
- TodayScreen: finite deck sized by daily goal; PaperCard v2; ActionBar; not-relevant reason
  sheet; progress ring; CaughtUpScreen at the end (no auto-loading more).
- ReadingLadder: card → abstract → OA PDF (expo-web-browser) → note.
- ReportSummarySheet posting to the report Worker (Phase 10) with offline queue.
- Every gesture has a button equivalent; accessibilityLabel/Role on all controls; reduce-motion.
Acceptance: screenshots of every screen in light/dark at default and 200% font scale.
```

## Phase 9: Library, matrix, export, recall, rhythm (3 days)

```
- LibraryScreen: Saved / Read later / Survey, search + filters, export BibTeX (existing
  logic/bibtex.ts), RIS and CSV via expo-sharing.
- SurveyScreen: matrix rows (editable), CSV export; prefill from card.matrixRow when present.
- RecallScreen: Leitner queue (1, 3, 7, 14, 30 days), max 3/day, self-grade.
- logic/streak.ts v2: goal-or-recall counts a day; 1 freeze per 7 active days, max 2 banked;
  neutral missed-day copy; weekly rhythm view. Port existing streak tests and add new ones.
- Local reminder via expo-notifications, opt-in after the first completed deck; auto-pause
  after 3 ignored days.
Acceptance: logic tests green; export files open correctly in Zotero (BibTeX/RIS) and Sheets (CSV).
```

## Phase 10: Report Worker, accessibility and compliance (2 days)

```
- workers/report/: Cloudflare Worker + D1 table reports(id, paperId, promptVersion, reason,
  note, ts, appVersion). Rate-limit per IP. When a paper gets ≥2 reports, open a GitHub issue
  (token in Worker secret) and add it to curation/overrides.json via PR.
- curation/overrides.json {hide:[ids], pin:{slug:[ids]}, editSummary:{id:{...}}} applied in
  publish.js. Then remove AdminScreen.tsx and adminService.ts (ask me first).
- Accessibility audit: contrast, labels, focus order, font scaling, TalkBack walk-through notes.
- Account deletion: in-app button + web page (GitHub Pages) that deletes users/{uid}.
- Update legal/privacy-policy.md and a docs/replan/play-data-safety.md answer sheet
  that matches what the app now actually collects.
Acceptance: checklist in PRODUCT-SPEC section 10 all ticked with evidence links.
```

## Phase 11: Release builds (½ day, then the 14-day test)

```
- app.json: set real package id (ask me), versionCode, adaptive icon from the design handoff.
- eas.json preview + production profiles; remind me to back up the keystore via `eas credentials`.
- Expo web export of the PWA to Cloudflare Pages (manifest, icons, offline cache).
- Write docs/replan/closed-test-plan.md: tester instructions, daily check-in script, and the
  questions Play asks when applying for production.
```

---

## Side task R: validate the complaint research with real Play Store reviews

Run this on your own machine; it was blocked in the research sandbox.

```
Create tools/review-mining/ with google-play-scraper (dev-only). Script:
1. search() for: "R Discovery", "Researcher discover discuss", "Semantic Scholar",
   "ResearchGate", "SciSpace", "Paperpal", "Blinkist", "Headway" → resolve appIds.
2. reviews() newest 500 per app (lang en, country in + us), keep score ≤ 3.
3. Classify each review into the 12 themes in docs/replan/research-report.html section 2
   using a keyword pass, then let me spot-check 50.
4. Output tools/review-mining/out/themes.csv and a markdown table: theme × app × count ×
   2 paraphrased examples (no verbatim copying beyond short phrases).
```
