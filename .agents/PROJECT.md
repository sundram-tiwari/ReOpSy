# Project: ReOpSy "Mission Control" Admin Panel & Pipeline Integration

## Architecture
- **Client Frontend**: Expo SDK 57 / React Native 0.86 / React 19 / React Native Web.
  - Auth: Modular Firebase Web Auth (`useAuth.ts`), checking `EXPO_PUBLIC_ADMIN_EMAIL` and Firestore `admins/{email}`.
  - Navigation: `@react-navigation/drawer` & `@react-navigation/native-stack`. Conditional "Mission Control" (Feather `shield` icon) in `DrawerContent.tsx` rendered strictly when `isAdmin === true`. Route `Admin` registered in `RootNavigator.tsx` with authorization guard.
  - UI Shell & Theme: `AdminScreen.tsx` using `app/src/theme.ts` tokens (`#000000` bg, `#121212` card, `#2a2a2a` cardBorder, `#1d9bf0` primary, Feather icons, 48px touch targets). 4 Tab sections:
    1. Flashcard Manager (`dailyFeed.json` grouped by topic, inline CRUD, Firestore `content` persistence, delete confirmation, search/filter).
    2. Pipeline Control (10 topics trigger fetch via Firestore `pipeline_queue`, last run stats from `pipeline_runs`).
    3. API Usage Dashboard (Summary cards + daily breakdown table from Firestore `api_usage`).
    4. Settings & Config (System prompt editor for Firestore `config/system_prompt`, Super Admin dynamic whitelist manager for Firestore `admins`).
- **Backend & Pipeline**: Node.js / Firestore Admin/Client SDK.
  - `backend/pipeline/fetchAndSummarize.js`: Logs run execution metadata (timestamp, paper counts per topic, errors) to Firestore `pipeline_runs`. Reads pending tasks from `pipeline_queue`.
  - `backend/pipeline/llm.js`: Dynamic system prompt retrieval from Firestore `config/system_prompt` (with fallback to hardcoded line 120 default). Logs every LLM API call (provider, status, timestamp, tokens) to Firestore `api_usage`.
- **Security & Rules**: `app/firestore.rules` updated to restrict `admins`, `config`, `pipeline_runs`, `pipeline_queue`, `api_usage` to authenticated admin users only; `content` overrides read-only for public, write-only for admins; `users/{uid}` owner-only.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Admin Auth & Dynamic Whitelist | `useAuth` hook exposes `isAdmin`, checks `EXPO_PUBLIC_ADMIN_EMAIL` and Firestore `admins` | M1 | R1 |
| F2 | Firestore Security Rules | Restrict `admins`, `config`, `pipeline_runs`, `pipeline_queue`, `api_usage`, `content` | M1 | R1, R6 |
| F3 | Zero-DOM Leakage Navigation | Conditional Drawer item with Feather `shield` icon, zero DOM traces for non-admins | M2 | R1, R2 |
| F4 | Admin Panel Shell & Dark Theme | `AdminScreen.tsx` with 4 tabs, theme tokens, Feather icons, 48px touch targets | M2 | R2 |
| F5 | Flashcard Manager Inline CRUD | Grouped by 10 topics, inline editing of catchy title, summary, source, delete confirmation, search bar | M2 | R3 |
| F6 | Flashcard Firestore Persistence | Edits and deletions persist to Firestore `content` collection and update UI feed | M2 | R3 |
| F7 | Pipeline Run Logging | `fetchAndSummarize.js` logs timestamp, per-topic paper counts, errors to `pipeline_runs` | M3 | R4 |
| F8 | Pipeline Control UI & Queue | Status display of last run + "Trigger Fetch" button per topic writing to `pipeline_queue` | M3 | R4 |
| F9 | LLM API Usage Logging | `llm.js` logs provider (Gemini/Mistral/Grok), success/failure, timestamp to `api_usage` | M3 | R5 |
| F10 | API Usage Dashboard UI | Daily aggregation table showing date, provider, total calls, successes, failures | M3 | R5 |
| F11 | System Prompt Editor & Dynamic Loader | Text editor for title prompt stored in Firestore `config/system_prompt`, read dynamically in `llm.js` | M4 | R6 |
| F12 | Admin Whitelist UI Manager | Super Admin UI to list, add, and remove admin emails in Firestore `admins` | M4 | R6 |
| F13 | Full E2E Test Suite & Verification | Pass 100% E2E tests (Tiers 1-4) + Adversarial Coverage Hardening (Tier 5) + `tsc` + `expo export` | M5 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Auth, Permissions & Security | `useAuth.ts`, `EXPO_PUBLIC_ADMIN_EMAIL`, Firestore `admins` lookup, `app/firestore.rules` | none | DONE |
| M2 | Navigation, Admin Shell & Flashcards | `RootNavigator.tsx`, `DrawerContent.tsx`, `AdminScreen.tsx`, Flashcard CRUD, Firestore `content` | M1 | DONE |
| M3 | Pipeline Control & API Usage | `fetchAndSummarize.js`, `llm.js` usage logging, Pipeline & API Usage UI sections | M1 | DONE |
| M4 | System Prompt Editor & Whitelist Manager | Settings section, Firestore `config` prompt in `llm.js`, Whitelist CRUD UI | M1, M2 | DONE |
| M5 | E2E Integration, 100% Pass & Tier 5 Hardening | E2E test verification (Tiers 1-4), Tier 5 adversarial testing, `tsc`, `expo export -p web` | M1, M2, M3, M4 | DONE |

## Interface Contracts

### 1. `useAuth.ts` ↔ Navigation & Components
```typescript
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  adminLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  error: string | null;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}
```

### 2. Firestore Document Schemas
- `admins/{email}`: `{ email: string, addedAt: string, addedBy: string }`
- `config/system_prompt`: `{ prompt: string, updatedAt: string, updatedBy: string }`
- `pipeline_runs/{runId}`: `{ runId: string, timestamp: string, topicCounts: Record<string, number>, totalPapers: number, errors: string[], status: 'success' | 'partial' | 'failed' }`
- `pipeline_queue/{queueId}`: `{ topic: string, requestedAt: string, status: 'pending' | 'processing' | 'completed', requestedBy: string }`
- `api_usage/{usageId}`: `{ id: string, timestamp: string, date: string, provider: 'Gemini' | 'Mistral' | 'Grok', success: boolean, error?: string, tokenCount?: number }`
- `content/dailyFeed`: `{ generatedAt: string, topics: Record<string, Paper[]>, updatedAt: string, updatedBy: string }`

### 3. `llm.js` Dynamic Config Contract
```javascript
// Function to resolve system prompt with fallback
async function getSystemPrompt(db = null) -> string
// Function to record API usage
async function logApiUsage(db = null, { provider, success, error, tokenCount }) -> Promise<void>
```

## Code Layout
- `app/src/hooks/useAuth.ts` — Auth hook with `isAdmin` & `isSuperAdmin` resolution
- `app/src/navigation/RootNavigator.tsx` — Stack navigator registering `Admin`
- `app/src/components/DrawerContent.tsx` — Conditional "Mission Control" drawer item with Feather `shield`
- `app/src/screens/AdminScreen.tsx` — Main tabbed Admin Screen (Flashcards, Pipeline, API Usage, Settings)
- `app/src/services/adminService.ts` — Firestore admin helper operations (CRUD for flashcards, queue, whitelist, prompt)
- `app/firestore.rules` — Firestore security rules
- `backend/pipeline/fetchAndSummarize.js` — Topic fetching + pipeline run logging
- `backend/pipeline/llm.js` — Multi-LLM provider + API usage logging + dynamic prompt loading
- `tests/e2e/` — E2E test suite and runner
