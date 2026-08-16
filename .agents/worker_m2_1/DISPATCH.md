## 2026-08-16T11:58:00Z

You are Worker M2 (Navigation, AdminScreen & Flashcard Manager Implementer).
Your working directory is: d:/Intern/ReOpSy/.agents/worker_m2_1
The project workspace is: d:/Intern/ReOpSy
The authoritative user request is at: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md
The project plan is at: d:/Intern/ReOpSy/.agents/PROJECT.md
The architecture specifications are in:
- `d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_survey_1/handoff.md`
- `d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_m1_1/handoff.md`

Your exclusive write ownership files:
- `app/src/navigation/RootNavigator.tsx`
- `app/src/components/DrawerContent.tsx`
- `app/src/screens/AdminScreen.tsx`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your mission:
1. `app/src/components/DrawerContent.tsx`:
   - Obtain `isAdmin` from `useAuth()`.
   - Render a conditional navigation item "Mission Control" with Feather icon `shield` (size 20, color matching theme) ONLY when `isAdmin === true`.
   - Ensure zero DOM elements, zero accessibility nodes, and zero text strings containing "Mission Control" or admin links are rendered when `isAdmin` is false.
   - On click, navigate to `'Admin'` screen.
2. `app/src/navigation/RootNavigator.tsx`:
   - Import `AdminScreen` and register `Admin` stack route (`<Stack.Screen name="Admin" component={AdminScreen} />`).
   - Define `Admin: undefined` in `RootStackParamList`.
3. `app/src/screens/AdminScreen.tsx`:
   - Implement the complete Mission Control admin panel using theme tokens from `app/src/theme.ts` (`#000000` bg, `#121212` card, `#2a2a2a` cardBorder, `#1d9bf0` primary, `#ffffff` text, `#a0a0a0` textDim, `#ff5252` danger, `#4caf50` success) and Feather icons exclusively. Minimum touch target size 48px for all interactive elements.
   - Authorization guard: If `!isAdmin && !adminLoading`, show an access denied state or redirect to Feed.
   - Top Header: Back button (`arrow-left`), Title "Mission Control", and Super Admin / Admin badge with user email.
   - Segmented Tab Navigation across all 4 sections:
     1. **Flashcard Manager (R3)**:
        - Topic filter pills (10 topics from `config.topics` + "All") and Search input (filtering catchyTitle, originalTitle, authors).
        - Load flashcards from `app/src/data/dailyFeed.json` and overlay any edits from Firestore `content/dailyFeed` via `adminService.getFeedOverrides()`.
        - Scrollable card list showing: topic tag, catchy title (editable inline), original title, summary (editable inline), authors, source/url (editable inline).
        - Inline editing: Clicking text field allows direct editing; "Save Changes" button persists changes to Firestore `content/dailyFeed` via `adminService.saveFeedOverrides()`.
        - Delete button per card with confirmation alert (`Alert.alert` or confirmation modal).
     2. **Pipeline Control (R4)**:
        - Status summary card showing last pipeline run timestamp, total papers ingested, run status, and error log (from `adminService.getLatestPipelineRun()`).
        - Grid / List of 10 predefined research topics (`ml`, `dl`, `nlp`, `cv`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`, `bio`).
        - Each topic shows topic name, icon, last paper count, and a "Trigger Fetch" button.
        - "Trigger Fetch" button writes to Firestore `pipeline_queue` via `adminService.triggerPipelineTopic(topic, user.email)` with a loading indicator and feedback alert.
     3. **API Usage Dashboard (R5)**:
        - Metric summary cards: Total API Calls, Successful Calls, Failed Calls, Active Providers (Gemini / Mistral / Grok).
        - Daily breakdown table: Date, Provider, Total Calls, Successes, Failures (fetched from `adminService.getApiUsageLogs()`).
     4. **Settings & Config (R6)**:
        - AI System Prompt Editor: Multiline text editor for title generation prompt (loaded from `adminService.getSystemPrompt()`, default fallback to standard prompt), "Save Prompt" button calling `adminService.saveSystemPrompt()`.
        - Dynamic Admin Whitelist Manager: Lists all current admin emails from `adminService.getAdminList()`. Super Admin badge for `EXPO_PUBLIC_ADMIN_EMAIL`. Input to add new admin email (`adminService.addAdmin`) and Remove button for non-superadmin emails (`adminService.removeAdmin`). Only enabled for Super Admin (`isSuperAdmin === true`).
4. Verification:
   - `cd app && npx tsc --noEmit`
   - `cd app && npx expo export -p web`
   - `node tests/e2e/runner.js`
