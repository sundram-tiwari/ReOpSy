# Handoff Report: Milestone 1 (Backend Pipeline & Content)

## 1. Observation
- **Initial Filter Bug**: In `backend/pipeline/fetchAndSummarize.js:65`, papers were filtered using `p.abstract && p.title && p.url`. Because OpenAlex sets `abstract = null` for non-open licences (while generating `summary`), papers for topics such as `ml`, `dl`, `ai-health`, `llm`, `robotics`, and `data-science` were discarded, resulting in 0 valid papers and fallback dummy cards (`dummy-*`).
- **Summary Fallback**: `fetchAndSummarize.js` previously only checked `fetchTldr(p.title)` and then directly invoked `fallbackSummarize(p.abstract || p.title, p.title)` without checking `p.summary`.
- **Database Schema**: In `backend/db/db.js`, the SQLite `papers` table had `id TEXT PRIMARY KEY`, which dropped duplicate papers across different topics on `INSERT OR IGNORE`.
- **SQL Seed**: `backend/schema.sql` previously only listed 6 topics (`ml`, `nlp`, `cv`, `systems`, `hci`, `bio`) instead of the required 10 topics.
- **LLM Fallback & Dry Run**: When running `node pipeline/fetchAndSummarize.js --dry`, exit code 0 was achieved across all 10 topics with non-zero valid papers for every topic.
- **Test Suite**: `npm test` runs `node --test "ingest/test/*.test.js"`, passing all 56 tests (pass: 56, fail: 0).
- **Daily Feed Artifact**: `app/src/data/dailyFeed.json` was generated with 92 real papers across all 10 topics (`ml`, `dl`, `nlp`, `cv`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`, `bio`), with 0 dummy entries.

## 2. Logic Chain
1. Updated `fetchAndSummarize.js` line 65 to filter with `(p.summary || p.abstract) && p.title && p.url`. This retains papers from OpenAlex and arXiv even when non-CC-BY license prevents storing the verbatim abstract.
2. Updated `fetchAndSummarize.js` summary extraction chain to strictly prioritize `fetchTldr(p.title)` -> `p.summary` -> `fallbackSummarize(p.abstract || p.title, p.title)` -> `"No abstract available."`.
3. Updated `backend/db/db.js` table definition to `PRIMARY KEY (id, topic)` and included a runtime PRAGMA check with table migration so existing sqlite databases transition safely without data loss.
4. Updated `backend/schema.sql` seed to insert all 10 topics (`ml`, `dl`, `nlp`, `cv`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`, `bio`).
5. Updated `backend/pipeline/llm.js` `callGemini` to iterate across active Gemini model versions (`gemini-2.5-flash`, `gemini-1.5-flash`, `gemini-2.0-flash`) and properly fall back through `Gemini -> Mistral -> Grok -> originalTitle`.
6. Ran full pipeline `node pipeline/fetchAndSummarize.js` which fetched, summarized, and persisted 92 real papers into SQLite and emitted `app/src/data/dailyFeed.json`.

## 3. Caveats
- OpenAlex concept ID for robotics (`C28881434`) yielded fewer records from OpenAlex directly, but arXiv query `cat:cs.RO` successfully provided 5 high-quality robotics papers, ensuring every category meets the content requirement.
- Rate-limiting (600ms on Semantic Scholar and 3s on arXiv) is enforced to ensure compliance with external API limits.

## 4. Conclusion
Milestone 1 is complete:
- Backend pipeline filters and summary fallback are fully operational.
- SQLite and schema.sql support multi-topic composite keys and all 10 topics.
- `dailyFeed.json` is fully populated with 92 real research papers across all 10 topics, containing zero dummy entries.
- All backend tests and dry-run verifications pass with exit code 0.

## 5. Verification Method
- Dry run verification:
  ```bash
  cd d:/Intern/ReOpSy/backend
  node pipeline/fetchAndSummarize.js --dry
  ```
  Expected output: Logs processing for all 10 topics and exits with code 0 (`DRY RUN COMPLETE.`).

- Unit test verification:
  ```bash
  cd d:/Intern/ReOpSy/backend
  npm test
  ```
  Expected output: 56 passing tests, 0 failures.

- Data feed validation:
  ```bash
  node -e "const feed = require('../app/src/data/dailyFeed.json'); const topics = Object.keys(feed.topics); console.log(topics.length === 10); console.log(Object.values(feed.topics).every(p => p.length > 0 && !p[0].id.startsWith('dummy-')));"
  ```
  Expected output: `true`, `true`.
