## 2026-08-16T11:40:05Z
You are Survey Explorer 2 (Backend & Security/Pipeline Specialist).
Your working directory is: d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_survey_2
The project workspace is: d:/Intern/ReOpSy
The user request is at: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md

Your mission:
Explore and document the backend architecture and Firestore configuration in `backend/` and `app/`. Specifically investigate:
1. `backend/pipeline/fetchAndSummarize.js` and `backend/pipeline/llm.js`. How are topics handled? What are the 10 predefined research topics? How does `llm.js` make API calls (Gemini/Mistral/Grok)? Where is the system prompt defined (line 120 or elsewhere)?
2. How to implement Firestore logging for:
   - `pipeline_runs`: timestamp, per-topic paper counts, errors.
   - `pipeline_queue`: topic fetch triggers.
   - `api_usage`: date, provider, success/failure, token counts.
   - `config`: system prompt storage & dynamic retrieval with fallback.
   - `admins`: whitelist collection.
3. `app/firestore.rules` (and any backend security rules). Inspect current rules and design exact rule updates to restrict `admins`, `config`, `api_usage`, `pipeline_runs`, `pipeline_queue`, and `content` collections to authenticated admin users while keeping existing app reads intact.
4. Backend dependencies, runtime environment, node version, Firebase Admin SDK / client SDK usage in backend scripts.

Write your comprehensive findings and architecture recommendations to `d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_survey_2/handoff.md`.
Use send_message to notify the orchestrator when done.
