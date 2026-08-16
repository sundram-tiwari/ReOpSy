# Original User Request

## 2026-08-16T11:39:23Z

Build a hidden "Mission Control" admin panel inside the existing ReOpSy Expo React Native web app. The admin panel must be completely invisible to regular users — no DOM elements, no navigation entries, no routes rendered. Only whitelisted admin emails can access it. The app is already deployed on Render and uses Firebase Auth (Google Sign-In) + Firestore for user data persistence.

Working directory: d:/Intern/ReOpSy
Integrity mode: development

## Verification Resources
The project uses standard Expo/React Native build tools. Use these commands for verification:
- `cd app && npx tsc --noEmit` — TypeScript type checking
- `cd app && npx expo export -p web` — Web build verification

## Requirements

### R1. Admin Authentication & Dynamic Whitelist
Upon Google Sign-In, the app must check whether the authenticated user's email matches either: (a) a hardcoded Super Admin email stored in the environment variable `EXPO_PUBLIC_ADMIN_EMAIL`, or (b) any email in a Firestore `admins` collection. If matched, the user gains admin privileges. The Super Admin (env-var email) can add or remove other admin emails from within the admin panel. The admin check must happen client-side after Firebase Auth returns the user object. Regular users must never see any admin UI elements — the admin screens and navigation entries must be conditionally rendered only when `isAdmin` is true. The existing `useAuth` hook at `app/src/hooks/useAuth.ts` must be extended to expose an `isAdmin` boolean. Firestore security rules at `app/firestore.rules` must be updated to allow admin-only read/write access to the `admins` and `config` collections.

### R2. Admin Panel UI — Hidden Screen with Dark Theme
Create a new `AdminScreen.tsx` in `app/src/screens/` with a tabbed or sectioned layout containing four sections: (1) Flashcard Manager, (2) Pipeline Control, (3) API Usage Dashboard, (4) Settings & Config. The admin panel must use the same dark theme, color palette, typography, and spacing tokens defined in the existing `app/src/theme.ts` and `app/src/theme/` directory. Use Feather icons only (no emojis) — consistent with the rest of the app. Add a conditional navigation entry in the drawer (`DrawerContent.tsx` at `app/src/components/DrawerContent.tsx`) that only renders when `isAdmin` is true — a "Mission Control" menu item with a Feather `shield` icon. Register the admin screen in `RootNavigator.tsx` at `app/src/navigation/RootNavigator.tsx`.

### R3. Flashcard Manager — Inline CRUD
The Flashcard Manager section must display all flashcards from `app/src/data/dailyFeed.json` in a scrollable list grouped by topic. Each flashcard row must show: catchy title, original title, summary (truncated), source, and topic. Clicking on any text field makes it editable inline. An admin can modify the catchy title, summary, or source URL and save changes. Changes must persist to the `dailyFeed.json` data source (write to Firestore `content` collection so edits survive pipeline re-runs). Include a delete button per flashcard with a confirmation dialog. Include a search/filter bar to find flashcards by title or topic.

### R4. Pipeline Control & Monitoring
The Pipeline Control section must show: (a) a "Trigger Fetch" button for each of the 10 predefined research topics that triggers the backend pipeline fetch for that specific topic, (b) the last pipeline run timestamp, (c) the number of papers fetched per topic in the last run, and (d) any errors from the last run. Pipeline run metadata (timestamps, paper counts, errors) must be logged to a Firestore `pipeline_runs` collection by the backend pipeline at `backend/pipeline/fetchAndSummarize.js`. The admin panel reads this collection to display status. For the "Trigger Fetch" button, since the app is a static frontend on Render, the trigger should write a document to a Firestore `pipeline_queue` collection specifying the topic — the pipeline can poll this queue on its next scheduled run.

### R5. API Usage Dashboard
The API Usage Dashboard must display a read-only summary of LLM API usage: total calls, successful calls, failed calls, and the provider used (Gemini/Mistral/Grok) — broken down by day. The backend pipeline's `llm.js` at `backend/pipeline/llm.js` must be modified to log each API call result (provider, success/failure, timestamp, token count if available) to a Firestore `api_usage` collection. The admin dashboard reads and displays this data in a simple table with daily aggregation. No external billing API integration is needed.

### R6. System Prompt Editor
The Settings & Config section must include: (a) a text editor for the AI system prompt used for title generation (currently hardcoded in `backend/pipeline/llm.js` line 120), (b) a dynamic admin email whitelist manager (add/remove emails from the `admins` Firestore collection). The system prompt must be stored in a Firestore `config` document. The pipeline's `llm.js` must be modified to read the prompt from Firestore at runtime (falling back to the hardcoded default if the Firestore document doesn't exist). The admin whitelist manager must show all current admin emails and allow the Super Admin to add or remove entries.

## Acceptance Criteria

### Programmatic Verification (Automated)
- [ ] `cd app && npx tsc --noEmit` completes with zero type errors.
- [ ] `cd app && npx expo export -p web` completes successfully.
- [ ] The string "Mission Control" does NOT appear in any rendered DOM element when a non-admin user is logged in (verified by searching the built output or by conditional rendering logic).

### Functional Verification (Agent-as-Judge)
- [ ] **Admin Auth:** When a user logs in with the email matching `EXPO_PUBLIC_ADMIN_EMAIL`, the drawer shows a "Mission Control" menu item. When any other user logs in, that menu item is absent from the DOM entirely.
- [ ] **Flashcard Editing:** An admin can navigate to Mission Control → Flashcard Manager, see flashcards grouped by topic, click on a title to edit it inline, save the change, and verify the change persists on page refresh.
- [ ] **Pipeline Control:** The Pipeline Control section displays topic names with status information and a "Trigger Fetch" button for each topic.
- [ ] **API Usage:** The API Usage section displays a table with columns for date, provider, total calls, successes, and failures.
- [ ] **Prompt Editor:** An admin can edit the system prompt text in the Settings section and save it to Firestore. The saved prompt can be read back from Firestore.
- [ ] **Admin Whitelist:** The Super Admin can add a new email to the admin list and remove an existing one, and the changes persist in Firestore.
- [ ] **Security:** Firestore rules prevent non-admin users from reading or writing to `admins`, `config`, `api_usage`, and `pipeline_runs` collections.
