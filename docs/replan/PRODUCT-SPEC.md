# ReOpSy v2 — Product Spec (source of truth for all agents)

Status: proposed, 2026-10-03. Research behind every decision: [research-report.html](research-report.html).
Sample data: [data/sample-cards.json](data/sample-cards.json).

## 1. Thesis

**ReOpSy turns ten minutes a day into a literature review you can export.**

Researchers don't lack papers. They lack a daily habit that filters the flood and keeps what matters,
in a form they can cite later. Every competitor stops at one step: discovery feeds (R Discovery,
Researcher, Scholar Inbox), graph explorers (ResearchRabbit, Litmaps), or AI Q&A (Elicit, SciSpace).
ReOpSy owns the whole loop:

```
TRIAGE (daily finite deck) → RECALL (spaced questions on what you saved) → SYNTHESIZE (literature matrix + export)
```

Users: PhD students and early researchers doing a literature survey; engineers and enthusiasts tracking a field.

## 2. Ten product rules (each answers a complaint theme in the report)

1. **Precision beats volume.** A topic preview shows 5 real papers before you subscribe. Every card says why it was shown. A "Not relevant" tap retrains the ranking.
2. **The deck ends.** It holds 5, 10 or 15 cards (the user's goal), then a "You're caught up" screen. No infinite scroll, no autoplay.
3. **Summaries are structured, hedged and checkable.** Each has Problem / Approach / Result / Limits in 45–70 words. Every number must appear in the abstract. Each carries an "AI-written" label and a one-tap "Report summary". The abstract is always one tap away.
4. **Headlines state the finding, not hype.** At most 12 words, key terms kept, the original title shown underneath. No clickbait rewriting.
5. **Access status is shown before the tap.** Open PDF, preprint, peer-reviewed, retracted and code-available chips appear on the card.
6. **At most one notification a day,** at a time the user picks. Opt-in, never guilt copy, and auto-pause after 3 ignored days. No contact invites.
7. **Streaks forgive.** Freezes are earned weekly, the weekly rhythm is the primary view, and milestones reward output (papers added to a survey, exports), not time spent.
8. **Local-first, export always.** The library works offline. BibTeX, RIS and CSV export work from day one. Sync is optional and additive.
9. **Fair money.** Reading is free forever and there are no ads. Billing is Play Billing only, with a renewal reminder 7 days ahead, 2-tap cancel, and no silent trial-to-paid.
10. **Open data first.** Use CC0 sources (arXiv metadata, OpenAlex). Never host PDFs. Never let an LLM produce a link or DOI.

## 3. MVP scope

**In (MVP):**
- Today deck
- Card v2
- Reading ladder: card → abstract → open PDF
- Triage actions: Not relevant / Save / Read later / Add to survey
- "Caught up" screen
- Topic catalog picker with preview
- Library
- Literature matrix with BibTeX/RIS/CSV export
- Recall: 3 questions a day from saves
- Weekly goal plus a forgiving streak
- Local reminder
- Report summary
- Offline cache
- Platforms: Android, plus a web PWA, which covers iOS without the $99/yr Apple fee

**Next (v1.x):**
- Custom topics: a typed phrase plus seed papers, resolved by a Worker
- Per-user ranking from on-device embeddings
- Weekly digest
- Zotero export
- Share-card images
- Lab / journal-club decks
- On-device text-to-speech
- Auto-extracted matrix columns

**Later (v2):**
- Citation-neighbourhood explorer (OpenAlex `referenced_works` / OpenCitations)
- Gap finder over the matrix
- Survey outline drafted only from library papers
- OpenReview conference mode
- Hindi and other summary languages
- Institutional plans

**Kill list:** remove these from the codebase or architecture.

| Remove | Why |
|---|---|
| Render web service, `backend/server.js` webhook, `backend/pipeline/cron.js`, `render.yaml` | The free tier spins down. A static CDN plus GitHub Actions needs no server. |
| SQLite (`backend/db/db.js`, `sqlite3` dependency), `tests/scratch_db/*.sqlite` | Render's disk is ephemeral. Binary test DBs should not be committed. |
| Supabase leftovers (`backend/schema.sql`, Supabase secrets in `ingest.yml`) | A third, unused data store. |
| `app/src/data/dailyFeed.json` as the main feed | It is stale the day it ships. Keep only a ≤20-card offline seed. |
| `customTopicFetcher.ts`, `apiValidator.ts`, `UserApiConfig` (user LLM keys stored on device, client-side LLM calls) | Security and UX risk. Replaced by Worker-resolved custom topics in v1.x. |
| `semanticScholar.js` TLDR-by-title search | Fragile title matching, and the S2 licence restricts redistribution. |
| `catchyTitle` generation | Replaced by a validated `headline`. |
| `likes` field | Social proof with no social layer behind it. |
| Admin flashcard CRUD (`AdminScreen.tsx`, 1,875 lines) | Replaced by `curation/overrides.json` edited by PR, plus a read-only status page. |
| Hardcoded 5 personal topics | Replaced by a catalog. |
| `.agents/` and `app/testbuild/` tracked in git | Agent scratch work and compiled output. Tag first, then untrack. |

**Keep:** Expo shell and navigation; Firebase Auth plus the `users/{uid}` doc (optional sync only); `logic/streak.ts`
(adapt); the BibTeX logic; the arXiv/OpenAlex adapters (upgrade them); the `node --test` setup; the GitHub Actions
failure-issue pattern in `ingest.yml`; the legal pages (update them).

## 4. Card v2 contract

```ts
export interface CardV2 {
  id: string;                 // 'arxiv:2608.19745' | 'doi:10.1234/abc'
  topic: string;              // catalog slug
  headline: string;           // ≤12 words, finding-first, validated
  originalTitle: string;
  summary: { problem: string; approach: string; result: string; limits: string }; // 45–70 words total
  summarySource: 'llm' | 'extractive';
  promptVersion: string;      // e.g. 'sum-v2.1'; bump invalidates cache
  authors: string[];          // first 3
  authorCount: number;
  published: string;          // YYYY-MM-DD, never in the future
  source: 'arXiv' | 'bioRxiv' | 'medRxiv' | 'OpenAlex' | 'EuropePMC';
  status: 'preprint' | 'peer-reviewed' | 'accepted' | 'workshop';
  venue: string | null;
  openAccess: boolean;
  retracted: boolean;
  links: { abstract: string; pdf: string | null; doi: string | null; code: string | null };
  keyNumbers: { value: string; label: string }[];   // each value must occur in the abstract
  whyShown: string;           // human-readable match reason
  score: number;              // 0..1 relevance, internal
  recall?: { question: string; answer: string };
  matrixRow?: { task: string; method: string; data: string; metric: string; result: string; limitation: string };
}
```

## 5. Topic catalog contract

```ts
export interface TopicDef {
  slug: string; label: string; icon: string; description: string;
  openalexTopicIds: string[];       // 'T12345' (Topics, NOT deprecated Concepts)
  arxivCategories: string[];        // e.g. ['cs.CV']
  arxivQuery?: string;
  europePmcQuery?: string;          // for biomedical topics
  requiredTerms: string[];          // regex sources; a candidate must hit ≥1 unless score ≥ strongScore
  excludeTerms: string[];
  seedPapers: string[];             // 5–10 arXiv IDs / DOIs that define the topic
  threshold: number;                // cosine cut-off, tuned on the gold set
}
```

## 6. Pipeline v2 (GitHub Actions, nightly, ₹0)

1. **Fetch.** Pull a 3-day window per topic from these sources:
   - arXiv: categories plus query, at most 1 request every 3 s.
   - OpenAlex: `topics.id`, `has_abstract:true`, `is_retracted:false`, publication date ≤ today. Needs a free API key; budget is $1/day.
   - Europe PMC: biomedical topics.
   - bioRxiv/medRxiv: by date range.
2. **Normalize and dedupe.** Match on DOI, then arXiv ID, then a normalized title hash.
3. **Hard gates.** Drop anything that fails one of these:
   - The abstract is at least 80 words and not placeholder or embargo text.
   - The publication date is not in the future.
   - The paper is not retracted (OpenAlex `is_retracted`, Crossref `update-to`).
   - The source type is article, preprint or proceedings. Self-deposits (Zenodo, figshare) are excluded unless they carry a venue DOI.
   - The language is English.
4. **Relevance.** Embed title and abstract locally with `@huggingface/transformers` (e.g. `bge-small-en-v1.5`, CPU). Score each candidate by cosine similarity to the topic profile (seed papers plus description), then apply the `requiredTerms` gate. Keep the top K above `threshold`, and add one labelled serendipity card per deck.
5. **Summarize.** Only selected papers are summarized, about 10 per topic per day. Each summary is cached forever by `id + promptVersion`.
   - **Output:** the LLM returns JSON.
   - **Validators:** word limits; numbers present in the abstract; a banned-hype list; headline length; no URLs in output.
   - **Retry:** one retry, with the validator errors fed back.
   - **Fallback:** clean extractive text (whole sentences only, never "…").
   - **Provider chain:** Groq → Gemini Flash-Lite → OpenRouter `:free` → extractive.
6. **Enrich.** Add the Unpaywall open-access URL, code links (regex on abstract/comments), and key numbers.
7. **Publish.** Write static JSON to Cloudflare Pages (or GitHub Pages) and keep a rolling 30 days:
   - `/v2/manifest.json`
   - `/v2/catalog.json`
   - `/v2/topics/{slug}/{YYYY-MM-DD}.json`
   - `/v2/papers/{id}.json`
8. **Report.** Write gold-set precision, counts, provider usage and validator failures to the Actions summary. Open an issue on failure (the existing pattern).

Daily budget at MVP (5–10 topics): ~2k embeddings (minutes of CPU), ≤100 LLM calls, ≤50 OpenAlex list calls.
At 100 topics: ~1,000 LLM calls/day, which still fits the combined free tiers. Cost scales with **papers, not users**.

## 7. App architecture

- **Feed:** fetch `manifest.json`, then today's shards for the followed topics. Cache in `expo-sqlite`. Works offline.
- **Local DB tables:**
  - `papers` (card JSON)
  - `interactions` (id, action, ts)
  - `library` (id, status: saved | later | survey, note, tags)
  - `surveys`
  - `survey_items` (editable matrix row)
  - `recall_queue` (id, dueAt, interval, ease)
  - `kv` (goals, streak, settings)
- **Optional sync:** Firebase Auth (Google) plus a single compact `users/{uid}` doc. Spark's 50k reads/day covers ~10k DAU at one read per open.
- **Reminders:** `expo-notifications` local schedule. No push server.
- **Report summary:** a Cloudflare Worker (free, 100k req/day) writes to D1 and opens a GitHub issue once reports cross a threshold.
- **Custom topics (v1.x):** a Worker that runs an OpenAlex search, embeds with Workers AI, caches in KV and returns a 5-paper preview.

## 8. Engagement rules

- The daily goal (5/10/15) defines deck size. The streak day counts if the goal is met OR recall is done.
- One freeze is earned per 7 active days, with at most 2 banked. A missed day with no freeze shows a neutral message ("New week, fresh start"), never shame.
- Milestones: first 10 cards triaged, first survey paper, first export, 10 papers in a survey, 7 recall sessions.
- Recall uses the next-day queue from saved cards, at most 3 questions a day, with Leitner-style intervals (1, 3, 7, 14, 30 days).
- Never ship any of these:
  - leaderboards (MVP)
  - red badge counts
  - countdown timers
  - streak-loss push notifications
  - paywall interrupts mid-deck
  - fake social notifications

## 9. Metrics and quality gates

| Metric | Gate |
|---|---|
| Gold-set precision per topic (20 hand-labelled papers per topic) | ≥ 0.80, or the topic isn't published |
| In-app "Not relevant" rate | < 20% of impressions |
| Summary validator pass rate | ≥ 95% (the rest fall back to extractive) |
| "Report summary" rate | < 1% of impressions |
| North star: papers triaged into library or survey, per weekly active user | Track weekly |
| Reminder opt-out after 14 days | < 30% |

## 10. Compliance checklist

- **Play Data Safety:** Google sign-in plus Firestore sync means the app **collects** email, user ID and library data for app functionality. Declare it honestly; the old "no data collected" answer is no longer true. Add in-app and web account deletion.
- **Play AI-generated content:** label summaries and provide in-app reporting.
- **Health declaration and "not medical advice" line:** required for the mental-health and autism topics.
- **DPDP Rules:** substantive duties apply from **13 May 2027** (notice, consent, deletion, grievance contact, breach notice). Local-first design keeps this small.
- **Licensing:**
  - arXiv metadata and OpenAlex are CC0.
  - Crossref abstracts may be publisher-owned, so link out rather than display them.
  - Never host PDFs.
  - Semantic Scholar data is not stored in commercial builds (its licence is restrictive and terminable).
  - Credit the sources on the About screen.
  - Do not imply arXiv endorsement.
- **New personal Play account:** a closed test with ≥12 testers opted in for 14 continuous days.
