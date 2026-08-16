# Backend & Content Pipeline Investigation Report (ReOpSy Version 2)

## 1. Observation

Direct observations from examining the ReOpSy backend codebase:

### A. Predefined Categories (10 Topics)
- **`backend/ingest/lib/topics.js` (lines 10–71)**:
  Defines `TOPICS` with 10 slugs: `ml`, `dl`, `nlp`, `cv`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`, `bio`.
  - `ml`: Machine Learning (`concepts.id:C119857082`, `cat:cs.LG OR cat:stat.ML`)
  - `dl`: Deep Learning (`concepts.id:C119857082`, `cat:cs.LG OR cat:cs.NE`)
  - `nlp`: Language & NLP (`concepts.id:C204321447`, `cat:cs.CL`)
  - `cv`: Computer Vision (`concepts.id:C31972630`, `cat:cs.CV`)
  - `ai-health`: AI in Mental Health (`concepts.id:C119857082`, `cat:cs.AI AND (all:"mental health" OR all:"psychiatry" OR all:"therapy")`)
  - `llm`: Large Language Models (`concepts.id:C204321447`, `cat:cs.CL AND (all:"large language model" OR all:"LLM")`)
  - `robotics`: Robotics & Control (`concepts.id:C28881434`, `cat:cs.RO`)
  - `cybersecurity`: Cybersecurity & AI (`concepts.id:C38652104`, `cat:cs.CR`)
  - `data-science`: Data Science (`concepts.id:C11413529`, `cat:stat.ML OR cat:stat.AP`)
  - `bio`: Computational Biology (`concepts.id:C70721500`, `cat:q-bio.QM OR cat:q-bio.GN OR cat:q-bio.BM`)
- **`app/src/config.ts` (lines 3–14)**:
  Matches the exact 10 slugs with icons (`cpu`, `layers`, `type`, `eye`, `heart`, `message-square`, `settings`, `lock`, `bar-chart-2`, `activity`).
- **`backend/schema.sql` (lines 18–24)**:
  Contains legacy 6 topics (`ml`, `nlp`, `cv`, `systems`, `hci`, `bio`). `systems` and `hci` are obsolete; the 5 new topics (`dl`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`) are missing from SQL seed.

### B. Pipeline & Filtering Bug
- **`backend/pipeline/fetchAndSummarize.js` (lines 64–67)**:
  ```javascript
  // 3. Dedupe
  const { papers: deduped } = dedupe(collected);
  const validPapers = deduped.filter(p => p.abstract && p.title && p.url).slice(0, 10);
  console.log(`  Fetched ${validPapers.length} valid papers for ${topic}.`);
  ```
- **`backend/ingest/lib/openalex.js` (line 132)**:
  `abstract: licenseOk ? abstract || null : null,`
- **`backend/ingest/lib/arxiv.js` (line 162)**:
  `abstract: licenseOk ? abstract || null : null,`
- **Observed Dry-Run Output (`node pipeline/fetchAndSummarize.js --dry`)**:
  ```
  Processing topic: ml
    Fetching OpenAlex for ml...
    Fetching arXiv for ml...
    Fetched 0 valid papers for ml.
  Processing topic: dl
    Fetched 0 valid papers for dl.
  Processing topic: nlp
    Fetched 2 valid papers for nlp.
  Processing topic: cv
    Fetched 2 valid papers for cv.
  Processing topic: ai-health
    Fetched 0 valid papers for ai-health.
  Processing topic: llm
    Fetched 2 valid papers for llm.
  Processing topic: robotics
    Fetched 0 valid papers for robotics.
  Processing topic: cybersecurity
    Fetched 1 valid papers for cybersecurity.
  Processing topic: data-science
    Fetched 0 valid papers for data-science.
  Processing topic: bio
    Fetched 1 valid papers for bio.
  DRY RUN COMPLETE.
  ```
- **`app/src/data/dailyFeed.json`**:
  Contains dummy placeholder cards for `ml`, `dl`, `ai-health`, `robotics`, `data-science` (`"id": "dummy-ml-...", "originalTitle": "No recent papers for ml"`) because `validPapers` was 0.

### C. Semantic Scholar Integration
- **`backend/pipeline/semanticScholar.js` (lines 14–52)**:
  - `fetchTldr(paperTitle)` queries `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&fields=tldr,title,externalIds&limit=1`.
  - Implements `await delay(600)` to respect the 100 req/5 min unauthenticated rate limit.
  - Returns `paper.tldr.text` if found, `null` on 429 or missing data.
- **`backend/pipeline/fetchAndSummarize.js` (lines 73–79)**:
  ```javascript
  let summary = await fetchTldr(p.title);
  if (!summary) {
    summary = fallbackSummarize(p.abstract || p.title, p.title);
  }
  if (!summary) {
    summary = "No abstract available.";
  }
  ```

### D. LLM Integration & Fallback Chaining
- **`backend/pipeline/llm.js` (lines 1–140)**:
  - `callGemini(prompt, apiKey)`: Calls `gemini-2.0-flash:generateContent` with temperature 0.7.
  - `callMistral(prompt, apiKey)`: Calls `https://api.mistral.ai/v1/chat/completions` with model `mistral-small-latest`.
  - `callGrok(prompt, apiKey)`: Calls `https://api.x.ai/v1/chat/completions` with model `grok-3-mini-fast`.
  - `generateCatchyTitle(originalTitle, summary, apiKeys)`:
    - Attempts Gemini (`apiKeys.gemini`)
    - On failure -> attempts Mistral (`apiKeys.mistral`)
    - On failure -> attempts Grok (`apiKeys.xai`)
    - On failure or no keys -> returns `{ catchyTitle: originalTitle, provider: 'original' }`.

### E. Data Persistence & SQLite Storage
- **`backend/db/db.js` (lines 13–98)**:
  - SQLite database at `backend/db/data/database.sqlite`.
  - Table `papers`: `id TEXT PRIMARY KEY, topic TEXT, originalTitle TEXT, catchyTitle TEXT, summary TEXT, authors TEXT, source TEXT, year INTEGER, venue TEXT, url TEXT, pdfUrl TEXT, fetchedAt DATETIME DEFAULT CURRENT_TIMESTAMP`.
  - `insertPaper(topic, paper)` uses `INSERT OR IGNORE INTO papers ...`.
  - `getLatestPapersForTopic(topic, limit = 10)` selects recent papers sorted by `fetchedAt DESC`.

---

## 2. Logic Chain

1. **Category Definition Alignment**: `backend/ingest/lib/topics.js` correctly defines all 10 topics needed for ReOpSy Version 2, aligning with `app/src/config.ts`. However, `backend/schema.sql` was not updated from V1 and contains 6 legacy topics.
2. **Root Cause of Empty Categories / Dummy Cards**:
   - In `openalex.js:132` and `arxiv.js:162`, `abstract` is deliberately set to `null` if the paper's license is not open CC-BY (`licenseOk === false`), while `summary` is populated for all papers using the extractive summarizer.
   - In `fetchAndSummarize.js:65`, `validPapers` filters by `p.abstract && p.title && p.url`. Because most academic papers do not declare open CC-BY licenses, `p.abstract` is `null`, causing `validPapers` to be empty for many topics.
   - When `validPapers.length === 0`, nothing is inserted into SQLite.
   - In `fetchAndSummarize.js:110–126`, if `latestPapers.length === 0`, dummy placeholder cards are written to `dailyFeed.json`.
3. **Summary Fallback Degradation**:
   - In `fetchAndSummarize.js:75`, when Semantic Scholar has no TLDR, `fallbackSummarize(p.abstract || p.title, p.title)` is called. Since `p.abstract` is `null`, `p.title` is passed as abstract, generating a poor metadata-only summary instead of reusing `p.summary` (the extractive summary already computed from the raw abstract during OpenAlex/arXiv ingest).
4. **Multi-LLM Fallback Chaining Execution**:
   - `pipeline/llm.js` implements the exact fallback chain `Gemini -> Mistral -> Grok -> original title` with proper error handling and logging.
5. **Dry Run Functionality**:
   - `node pipeline/fetchAndSummarize.js --dry` iterates over all 10 topics and exits with code 0 without touching the DB or writing `dailyFeed.json`.
6. **Data Retention on Failure**:
   - If network calls fail, `getLatestPapersForTopic(topic, 10)` queries the SQLite database to retain previously ingested papers. If the DB is populated, no dummy entries are produced.
   - Primary key in SQLite is `id TEXT PRIMARY KEY`, meaning if a paper is cross-listed across two topics, `insertPaper` only records the first topic encountered. Changing to `PRIMARY KEY (id, topic)` ensures multi-topic retention.

---

## 3. Caveats

1. **Semantic Scholar Free Tier Quota**: Unauthenticated Semantic Scholar calls are rate-limited to 100 requests per 5 minutes. The pipeline adds a 600ms delay per paper; when processing 100 papers across 10 topics, total runtime is ~60–80 seconds.
2. **LLM API Keys**: The local `.env` contains `GEMINI_API_KEY`. Mistral and xAI keys are optional fallbacks and will gracefully cascade to the original title if unset.
3. **Dual DB Backend**: SQLite (`backend/db/db.js`) is used by `fetchAndSummarize.js` for local feed generation, while Supabase (`backend/ingest/lib/db.js`) is used by `ingest/ingest.js`. The mobile app loads `app/src/data/dailyFeed.json`.

---

## 4. Conclusion & Recommended Architecture

### Assessment Summary
- **R1 (Predefined Categories with Content & Multi-LLM)**: ~85% complete. The multi-LLM chain, Semantic Scholar TLDR, dry-run CLI, and 10 topic queries are implemented. However, the filtering bug in `fetchAndSummarize.js:65` and summary fallback in `fetchAndSummarize.js:75` must be fixed to populate all 10 topics with real papers.
- **R5 (Scalable Content Architecture & Security)**:
  - **4-Level Hierarchy**:
    - *Level 1 (Default)*: 10 static/cached categories in `dailyFeed.json` and SQLite.
    - *Level 2 (User-Customized)*: Followed topics stored in User State (Firestore/AsyncStorage).
    - *Level 3 (User API Content)*: Live client-side summarization with user's Gemini/Mistral/Grok key without server cost.
    - *Level 4 (Highly Specific Research)*: Specific queries (e.g., "Explainable AI for Depression Detection") queried via Semantic Scholar/OpenAlex and summarized via user API.
  - **Security**: User API keys must reside only in authenticated user Firestore documents (`users/{userId}`) and local AsyncStorage; never exposed in public repositories, logs, or unauthenticated queries.

### Proposed Code Fixes

#### Fix 1: `backend/pipeline/fetchAndSummarize.js`
Replace line 65 and lines 73–79:
```javascript
// Line 65: Use p.summary or p.abstract so valid papers are not dropped
const validPapers = deduped.filter(p => (p.summary || p.abstract) && p.title && p.url).slice(0, 10);

// Lines 73-79: Use Semantic Scholar TLDR -> Existing extractive summary -> Fallback summarizer
let summary = await fetchTldr(p.title);
if (!summary) {
  summary = p.summary || fallbackSummarize(p.abstract || p.title, p.title);
}
if (!summary) {
  summary = "No abstract available.";
}
```

#### Fix 2: `backend/db/db.js`
Update table schema to support multi-topic papers:
```sql
CREATE TABLE IF NOT EXISTS papers (
  id TEXT,
  topic TEXT,
  originalTitle TEXT,
  catchyTitle TEXT,
  summary TEXT,
  authors TEXT,
  source TEXT,
  year INTEGER,
  venue TEXT,
  url TEXT,
  pdfUrl TEXT,
  fetchedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, topic)
)
```

#### Fix 3: `backend/schema.sql`
Update seed topics to include all 10 V2 topics (`ml`, `dl`, `nlp`, `cv`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`, `bio`).

---

## 5. Verification Method

### Automated Commands
1. **Dry-run verification**:
   ```bash
   cd d:/Intern/ReOpSy/backend
   node pipeline/fetchAndSummarize.js --dry
   ```
   *Expected*: Passes with exit code 0, iterates all 10 topics. With Fix 1 applied, every topic shows `Fetched > 0 valid papers`.

2. **Backend unit tests**:
   ```bash
   cd d:/Intern/ReOpSy/backend
   npm test
   ```
   *Expected*: All 56 tests in `ingest/test/*.test.js` pass.

3. **Full pipeline execution & Feed generation**:
   ```bash
   cd d:/Intern/ReOpSy/backend
   node pipeline/fetchAndSummarize.js
   ```
   *Expected*: Generates `app/src/data/dailyFeed.json` containing 10 topics with 5–10 real research papers per topic and catchy titles generated via Gemini/fallback.

4. **Feed Inspection**:
   Check `app/src/data/dailyFeed.json` for non-empty topics and absence of `dummy-*` paper IDs.
