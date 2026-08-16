## 2026-08-16T07:09:27Z
You are Worker 4 implementing Milestone 4 (Settings Screen, User API Keys & Custom Live Topic Fetch - R4 & R5) for ReOpSy Version 2.

Your working directory: d:/Intern/ReOpSy/.agents/teamwork_preview_worker_m4_1
Original request path: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md
Project specification path: d:/Intern/ReOpSy/.agents/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Instructions:
1. Read `d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md` and `d:/Intern/ReOpSy/.agents/PROJECT.md`.
2. Implement all Milestone 4 requirements:
   - **`app/src/services/apiValidator.ts`**:
     Create live connection validator supporting Gemini, Mistral, Grok, and Custom endpoints. Mask/sanitize any API keys in error strings so credentials never leak to logs or UI alerts.
   - **`app/src/services/customTopicFetcher.ts`**:
     Create live custom topic fetcher querying arXiv API (`https://export.arxiv.org/api/query?search_query=all:...`) and synthesizing catchy titles and flashcard summaries using the user's chosen LLM provider (Gemini, Mistral, Grok, or Custom), with graceful fallback to raw title/summary if the LLM request fails. Tag generated papers with `topics: ['custom']` and `contentLevel: 4`.
   - **`app/src/screens/SettingsScreen.tsx`**:
     - Provider selection: Gemini, Mistral, Grok, Custom (with endpoint input for Custom).
     - Secure masked API key input with eye toggle (Feather `eye` / `eye-off`) and masked preview (e.g. `••••••••1234`).
     - Real connection testing button invoking `validateApiConnection`.
     - Custom research topic input (e.g. "Explainable AI for Depression Detection") and "Fetch Topic Papers" action that fetches and updates the custom paper feed.
     - Clear/Disconnect button that safely wipes credentials and custom topic state.
     - Ensure touch targets are >= 48px and all icons use Feather vector icons.
   - **`app/src/components/TopicTabs.tsx` & `app/src/screens/FeedScreen.tsx`**:
     - In `TopicTabs.tsx`, if user has a configured `customTopic` or custom papers in state, dynamically render a `"custom"` tab (using Feather icon `target` and label `userApiConfig.customTopic || 'Custom'`) alongside followed default topics.
     - In `FeedScreen.tsx`, when `activeTopic === 'custom'`, render the custom papers deck. Ensure the 10 default predefined categories remain completely isolated and intact from `dailyFeed.json`.
   - **`app/src/state/AppState.tsx` & `app/src/types.ts`**:
     - Support `customFeedData: Paper[]`, `setCustomFeedData`, and `fetchCustomPapers` action in `AppState`.
   - **`firestore.rules`**:
     - Provide Firestore Security Rules document ensuring `/users/{userId}` is strictly owner-only.
3. Verification:
   - Run `cd app && npx tsc --noEmit` -> Must complete with 0 errors.
   - Run `cd app && npm test` -> Must pass.
   - Run `cd app && npx expo export -p web` -> Must produce web build in `dist/` with exit code 0.
   - Run `node tests/run_all_e2e.js` -> Must pass all 52 tests.
4. Document all changes and verification outputs in `d:/Intern/ReOpSy/.agents/teamwork_preview_worker_m4_1/handoff.md` and send a message when done.
