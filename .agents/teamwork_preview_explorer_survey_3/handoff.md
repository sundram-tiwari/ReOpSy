# Survey Report: ReOpSy "Mission Control" Feature Inventory, Interface Contracts & 4-Tier E2E Testing Strategy

**Explorer**: Survey Explorer 3 (Feature Inventory & E2E Testing Specialist)  
**Workspace**: `d:/Intern/ReOpSy`  
**Date**: 2026-08-16  

---

## 1. Observation

Direct facts, code locations, configurations, and test runs observed across the workspace:

### 1.1 Core Requirements & Files Observed
1. **Original Request (`.agents/ORIGINAL_REQUEST.md`)**:
   - Outlines 6 requirements (R1–R6) to build a hidden "Mission Control" admin panel in the ReOpSy Expo React Native web app deployed on Render with Firebase Auth (Google Sign-In) + Firestore.
   - Programmatic verification commands specified:
     - `cd app && npx tsc --noEmit` (TypeScript typecheck)
     - `cd app && npx expo export -p web` (Web build verification)
     - Absence of string "Mission Control" in rendered DOM for non-admin users.

2. **Existing Authentication & Permissions (`app/src/hooks/useAuth.ts`)**:
   - Lines 14–21: `UseAuthReturn` interface currently only exposes `user`, `loading`, `error`, `isConfigured`, `signInWithGoogle`, `signOut`.
   - Lacks `isAdmin`, `isSuperAdmin`, `adminEmails`, or any role check against `EXPO_PUBLIC_ADMIN_EMAIL` or Firestore `admins` collection.
   - Lines 29–63: `onAuthStateChanged` listens to Firebase user changes.

3. **Existing Navigation & Drawer (`app/src/components/DrawerContent.tsx` & `app/src/navigation/RootNavigator.tsx`)**:
   - `DrawerContent.tsx` (Lines 77–125): Renders menu items for Personalize (`sliders`), Saved (`bookmark`), Settings (`settings`), and Sign Out (`log-out`). Does not contain "Mission Control" or `shield` icon yet.
   - `RootNavigator.tsx` (Lines 50–60): Stack registers `MainDrawer`, `Personalization`, `Saved`, and `Settings`. Does not register `Admin` / `AdminScreen` yet.

4. **Existing Pipeline & LLM Backend (`backend/pipeline/`)**:
   - `backend/pipeline/fetchAndSummarize.js` (Lines 47–175): Fetches OpenAlex and arXiv for 10 topic slugs (`ALL_SLUGS`), generates titles, writes to SQLite (`backend/db/db.js`) and outputs `app/src/data/dailyFeed.json`. Does not yet log run metadata to Firestore `pipeline_runs` or consume `pipeline_queue`.
   - `backend/pipeline/llm.js` (Lines 119–150): Hardcodes system prompt on Line 120:
     ```javascript
     const prompt = `Rewrite the following research paper title into a catchy, engaging title in under 10 words. Only return the new title, without quotes or additional text.\n\nOriginal Title: ${originalTitle}\nSummary: ${summary}`;
     ```
     Cascades Gemini -> Mistral -> Grok -> Original Title. Does not yet log API calls to Firestore `api_usage` or read dynamic prompt from Firestore `config`.

5. **Existing Security Rules (`app/firestore.rules` & `firestore.rules`)**:
   - Lines 6–8: Only allows `match /users/{userId} { allow read, write: if request.auth != null && request.auth.uid == userId; }`.
   - Missing rules for `/admins`, `/config`, `/content`, `/pipeline_runs`, `/pipeline_queue`, and `/api_usage`.

6. **Existing Test Infrastructure (`TEST_INFRA.md`, `tests/`, `app/package.json`, `backend/package.json`)**:
   - Test runner: `tests/run_all_e2e.js` executes 4 tiers using Node.js native test runner (`node:test` + `node:assert/strict`):
     - `tier1_features.test.js` (Feature coverage)
     - `tier2_boundaries.test.js` (Boundary & corner cases)
     - `tier3_combinatorial.test.js` (Cross-feature combinations)
     - `tier4_workloads.test.js` (Real-world workload journeys)
   - Test helpers in `tests/helpers/`:
     - `mockStorage.js`: `MockAsyncStorage` & `MockFirestore`
     - `mockLlm.js`: `MockLlmHarness` (Gemini, Mistral, Grok, arXiv, Semantic Scholar mock fetcher)
     - `astAuditor.js`: `AstAuditor` (ast analysis for emojis, unicode glyphs, touch targets, snap-scroll, typography parity, masked inputs)
     - `dataValidator.js`: `validatePaper` & `validateDailyFeed`
   - Test execution status: Running `node tests/run_all_e2e.js` executed 4 tiers, running 52 unit/e2e tests in under 1.8s.

---

## 2. Logic Chain

From the observed code structure and requirements, the implementation and testing strategy must follow this logical deduction:

```
[Google Sign-In / User Auth]
         │
         ├──► Matches EXPO_PUBLIC_ADMIN_EMAIL (Super Admin) ──┐
         │                                                    ├──► isAdmin = true
         └──► Matches email in Firestore `admins` (Admin) ────┘
                                                                │
                     ┌──────────────────────────────────────────┴──────────────────────────────────────────┐
                     ▼                                                                                     ▼
           [DrawerContent.tsx]                                                                    [RootNavigator.tsx]
     Conditionally renders "Mission Control"                                                Unlocks /Admin Stack Screen
         (Feather 'shield' icon)                                                                           │
                     │                                                                                     ▼
                     └──────────────────────────────────────────────────────────────────────────► [AdminScreen.tsx]
                                                                                                    │
         ┌──────────────────────────────┬──────────────────────────────┬────────────────────────────┴──────────────────────────┐
         ▼                              ▼                              ▼                                                       ▼
   [Section 1: Flashcards]    [Section 2: Pipeline]       [Section 3: API Usage]                                  [Section 4: Settings & Config]
   - Grouped by 10 topics     - Trigger fetch per topic   - Table of daily API usage                              - System Prompt Editor
   - Inline edit catchyTitle/   (writes to pipeline_queue) - Breakdown by provider                                  (persists to config/prompts)
     summary/source URL       - Reads last run status/      (Gemini / Mistral / Grok)                             - Dynamic Whitelist Manager
   - Delete with confirm        paper counts/errors from  - Reads from api_usage                                    (add/remove admins)
   - Search/filter bar          pipeline_runs               collection
   - Persists to Firestore                                                                                        
     `content` collection
```

### 2.1 Exhaustive Requirement Breakdown (R1 – R6)

#### Requirement R1: Admin Authentication & Dynamic Whitelist
- **Core Mechanism**:
  1. `useAuth` hook tracks authenticated `user`.
  2. On user state change, verify:
     - `const superAdminEmail = (process.env.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();`
     - Check if `user.email.toLowerCase() === superAdminEmail` -> `isAdmin = true`, `isSuperAdmin = true`.
     - Query Firestore `admins` collection (`getDocs(collection(db, 'admins'))` or `getDoc(doc(db, 'admins', sanitizedEmail))`). If found -> `isAdmin = true`.
     - Otherwise -> `isAdmin = false`.
  3. Whitelist mutation methods:
     - `addAdminEmail(email: string)`: Super Admin can add document to `admins`.
     - `removeAdminEmail(email: string)`: Super Admin can delete document from `admins`.
- **Edge Cases**:
  - Email case mismatches (e.g. `Admin@ReOpSy.com` vs `admin@reopsy.com`).
  - Missing or blank `EXPO_PUBLIC_ADMIN_EMAIL` in environment.
  - Network disconnection during Firestore whitelist fetch (fallback to Super Admin env check if match, else safe deny).
  - Logout: immediately clears `isAdmin = false` and resets admin memory state.
  - Non-admin attempting to invoke `addAdminEmail` or `removeAdminEmail` (rejected on client and blocked by Firestore security rules).

#### Requirement R2: Admin Panel UI — Hidden Screen with Dark Theme
- **Core Mechanism**:
  1. Create `app/src/screens/AdminScreen.tsx`.
  2. 4-tab sectioned layout: Flashcards, Pipeline, API Usage, Settings.
  3. Strictly apply tokens from `app/src/theme.ts`:
     - Background: `colors.bg` (`#000000`)
     - Cards: `colors.card` (`#121212`), Border: `colors.cardBorder` (`#2a2a2a`)
     - Text: `colors.text` (`#ffffff`), Dim: `colors.textDim` (`#a0a0a0`)
     - Primary: `colors.primary` (`#1d9bf0`), Danger: `colors.danger` (`#ff5252`), Success: `colors.success` (`#4caf50`)
     - Spacing & Typography tokens.
  4. Feather icons exclusively (`shield`, `book-open`, `play-circle`, `activity`, `sliders`, `trash-2`, `edit-2`, `plus`, `search`, etc.). No emojis.
  5. Touch targets minimum `48x48px` or `hitSlop`.
  6. Drawer entry in `DrawerContent.tsx`:
     ```tsx
     {isAdmin && (
       <TouchableOpacity 
         style={styles.menuItem} 
         onPress={() => props.navigation.navigate('Admin')}
         activeOpacity={0.7}
         hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
         accessibilityLabel="Mission Control admin panel"
       >
         <Feather name="shield" size={20} color={colors.primary} style={{ marginRight: spacing.m }} />
         <Text style={[styles.menuItemText, { color: colors.primary, fontWeight: 'bold' }]}>Mission Control</Text>
       </TouchableOpacity>
     )}
     ```
- **Edge Cases**:
  - Regular user bundle DOM inspection: ensure zero text nodes containing "Mission Control" appear in the DOM tree when `isAdmin === false`.
  - Deep-link navigation to `AdminScreen` when unauthenticated or non-admin (render null or navigate to `Feed`).
  - Small screen responsiveness across mobile and web viewports.

#### Requirement R3: Flashcard Manager — Inline CRUD
- **Core Mechanism**:
  1. Load flashcards from `app/src/data/dailyFeed.json`.
  2. Subscribe or fetch Firestore `content` collection to apply overrides and deletions.
  3. Group flashcards by the 10 topic slugs.
  4. Search/filter bar allows filtering by title, summary, authors, topic.
  5. Inline edit mode: clicking catchy title, summary, or source URL toggles `TextInput`.
  6. Saving writes override to Firestore `content` collection (`doc(db, 'content', paperId)`).
  7. Deletion triggers native alert confirmation; on confirmation, marks `isDeleted: true` in Firestore `content`.
  8. Precedence: When app loads, `dailyFeed.json` + Firestore `content` overrides are merged so changes survive pipeline regenerations.
- **Edge Cases**:
  - Blanking out required fields (validation prevents saving empty catchy title or summary).
  - Deleting all flashcards in a topic (clean empty state).
  - Long strings (>2000 chars in summary) preserve formatting.
  - Search queries containing special characters (`(`, `[`, `*`, `?`).

#### Requirement R4: Pipeline Control & Monitoring
- **Core Mechanism**:
  1. Frontend displays status card for each of the 10 topics.
  2. "Trigger Fetch" button per topic writes a job to Firestore `pipeline_queue`:
     ```typescript
     await addDoc(collection(db, 'pipeline_queue'), {
       topic: slug,
       requestedAt: new Date().toISOString(),
       requestedBy: user.email,
       status: 'pending'
     });
     ```
  3. Frontend reads last run status from Firestore `pipeline_runs` (latest document by `timestamp` desc):
     - Displays timestamp, total papers, per-topic counts, run duration, and error list.
  4. Backend `backend/pipeline/fetchAndSummarize.js`:
     - Logs run summary to Firestore `pipeline_runs` on completion:
       ```javascript
       await setDoc(doc(db, 'pipeline_runs', `run_${Date.now()}`), {
         timestamp: new Date().toISOString(),
         topicsProcessed,
         totalPapers,
         topicCounts,
         errors: runErrors,
         durationMs
       });
       ```
     - Checks `pipeline_queue` collection for pending fetch requests.
- **Edge Cases**:
  - Rapid double-clicking "Trigger Fetch" (debounce & disable while submitting).
  - First-time boot when `pipeline_runs` is empty (renders friendly "No runs recorded").
  - Partial run failure (displays error badges on specific topics that failed while showing succeeded topics).

#### Requirement R5: API Usage Dashboard
- **Core Mechanism**:
  1. Backend `backend/pipeline/llm.js` logs each API call to Firestore `api_usage`:
     ```javascript
     await addDoc(collection(db, 'api_usage'), {
       timestamp: new Date().toISOString(),
       date: new Date().toISOString().split('T')[0],
       provider: 'gemini' | 'mistral' | 'xai',
       status: 'success' | 'failure',
       error: sanitizedError || null,
       tokenCount: estimatedTokens || null
     });
     ```
  2. Frontend `AdminScreen.tsx` (API Usage tab) queries `api_usage` collection.
  3. Client aggregates records by Date (`YYYY-MM-DD`) and Provider:
     - Table columns: `Date` | `Provider` | `Total Calls` | `Successes` | `Failures` | `Success Rate (%)`
     - Summary metrics: Total Calls, Overall Success Rate, Most Active Provider.
- **Edge Cases**:
  - Zero usage recorded state.
  - Sanitization: ensuring no raw API keys or auth headers are logged in error messages.
  - Failure logging even when LLM provider throws network error or rate limit (HTTP 429).

#### Requirement R6: System Prompt Editor & Whitelist Manager
- **Core Mechanism**:
  1. Settings & Config tab contains two primary modules:
     - **AI System Prompt Editor**:
       * Fetches dynamic prompt from Firestore `doc(db, 'config', 'prompts')` (field: `titlePrompt`).
       * Fallback to hardcoded default prompt from `llm.js`.
       * Multi-line editor with variables placeholder preview (`{title}`, `{summary}`).
       * "Save Prompt" writes updated prompt to Firestore `config/prompts`.
       * "Reset to Default" restores original prompt.
       * Backend `llm.js` reads Firestore prompt at runtime before falling back to default.
     - **Dynamic Admin Email Whitelist**:
       * Lists all emails in Firestore `admins` collection.
       * Displays Super Admin (`EXPO_PUBLIC_ADMIN_EMAIL`) as root with immutable lock.
       * Add email input + "Add Admin" button (validates email syntax, writes to `admins`).
       * Remove button per whitelisted email with confirmation dialog (Super Admin cannot be removed).
- **Edge Cases**:
  - Saving empty prompt (disallowed by validator).
  - Removing Super Admin email (UI disallows and server rules reject).
  - Adding malformed email strings (`notanemail`, `@domain.com`, `user@`).
  - Backend pipeline running without Firestore credentials (falls back to hardcoded prompt cleanly).

---

## 3. Interface Contracts

### 3.1 Firestore Collections & Document Schemas

```
Firestore Database
├── /admins/{sanitizedEmail}
│   ├── email: string (lowercase)
│   ├── addedBy: string (email)
│   ├── addedAt: string (ISO timestamp)
│   └── role: "admin"
│
├── /config/prompts
│   ├── titlePrompt: string
│   ├── defaultPrompt: string
│   ├── updatedAt: string (ISO timestamp)
│   └── updatedBy: string (email)
│
├── /content/{paperId}
│   ├── paperId: string
│   ├── topic: string
│   ├── catchyTitle?: string
│   ├── originalTitle?: string
│   ├── summary?: string
│   ├── url?: string
│   ├── isDeleted?: boolean
│   ├── updatedAt: string (ISO timestamp)
│   └── updatedBy: string (email)
│
├── /pipeline_runs/{runId}
│   ├── runId: string
│   ├── timestamp: string (ISO timestamp)
│   ├── durationMs: number
│   ├── topicsProcessed: number
│   ├── totalPapers: number
│   ├── topicCounts: Record<string, number>
│   ├── errors: Array<{ topic: string, error: string }>
│   └── triggeredBy?: string
│
├── /pipeline_queue/{jobId}
│   ├── topic: string
│   ├── requestedAt: string (ISO timestamp)
│   ├── requestedBy: string (email)
│   └── status: "pending" | "processing" | "completed" | "failed"
│
├── /api_usage/{logId}
│   ├── timestamp: string (ISO timestamp)
│   ├── date: string (YYYY-MM-DD)
│   ├── provider: "gemini" | "mistral" | "xai" | "custom"
│   ├── status: "success" | "failure"
│   ├── error?: string
│   └── tokenCount?: number
│
└── /users/{userId}
    └── (Existing user state: followedTopics, savedPapers, streak, etc.)
```

### 3.2 Firestore Security Rules (`firestore.rules`)
```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // User profile, preferences, API keys, and bookmarks
    match /users/{userId} {
      allow read, write: if isOwner(userId);
    }

    // Content overrides (Flashcard edits and deletions)
    match /content/{paperId} {
      allow read: if true; // Public read so feed overrides reach all users
      allow write: if isAuthenticated(); // Restrict to admin in practice
    }

    // Admin whitelist
    match /admins/{adminId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }

    // System configuration (System prompt)
    match /config/{configId} {
      allow read: if true; // Backend/Frontend can read system prompts
      allow write: if isAuthenticated();
    }

    // Pipeline execution history and status
    match /pipeline_runs/{runId} {
      allow read, write: if isAuthenticated();
    }

    // Topic fetch queue
    match /pipeline_queue/{jobId} {
      allow read, write: if isAuthenticated();
    }

    // LLM API usage tracking
    match /api_usage/{logId} {
      allow read, write: if isAuthenticated();
    }
  }
}
```

### 3.3 Environment Variables Contract
| Variable Name | Scope | Required In | Description |
|---|---|---|---|
| `EXPO_PUBLIC_ADMIN_EMAIL` | Frontend | `app/.env` | Hardcoded Super Admin email checked client-side upon Google Sign-In |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Frontend | `app/.env` | Firebase Web API Key |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Frontend | `app/.env` | Firebase Auth Domain (`reopsy-a.firebaseapp.com`) |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Frontend | `app/.env` | Firebase Project ID (`reopsy-a`) |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Frontend | `app/.env` | Firebase Storage Bucket |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Frontend | `app/.env` | Firebase Messaging Sender ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Frontend | `app/.env` | Firebase App ID |
| `GEMINI_API_KEY` | Backend | `backend/.env` | Google Gemini API Key for title generation |
| `MISTRAL_API_KEY` | Backend | `backend/.env` | Mistral API Key for fallback title generation |
| `XAI_API_KEY` | Backend | `backend/.env` | Grok (xAI) API Key for fallback title generation |

### 3.4 Hook and Component Type Signatures
```typescript
// app/src/hooks/useAuth.ts
export interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminEmails: string[];
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  addAdminEmail?: (email: string) => Promise<boolean>;
  removeAdminEmail?: (email: string) => Promise<boolean>;
}

// Flashcard Edit State Interface
export interface FlashcardOverride {
  paperId: string;
  topic: string;
  catchyTitle?: string;
  originalTitle?: string;
  summary?: string;
  url?: string;
  isDeleted?: boolean;
  updatedAt: string;
  updatedBy: string;
}

// Pipeline Run Log Interface
export interface PipelineRunLog {
  runId: string;
  timestamp: string;
  durationMs: number;
  topicsProcessed: number;
  totalPapers: number;
  topicCounts: Record<string, number>;
  errors: Array<{ topic: string; error: string }>;
}

// API Usage Aggregation Interface
export interface ApiUsageSummary {
  date: string;
  provider: string;
  totalCalls: number;
  successes: number;
  failures: number;
  successRate: number;
}
```

---

## 4. 4-Tier E2E Testing Framework Strategy Design

The master test runner `tests/run_all_e2e.js` and associated test files should be extended to cover the full Mission Control specification across all 4 tiers:

```
                                ┌──────────────────────────────────────────────┐
                                │       MASTER E2E TEST RUNNER                │
                                │           tests/run_all_e2e.js               │
                                └──────────────────────┬───────────────────────┘
                                                       │
         ┌─────────────────────┬──────────────────────┴──────────────────────┬─────────────────────┐
         │                     │                                             │                     │
┌────────▼────────┐   ┌────────▼────────┐                           ┌────────▼────────┐   ┌────────▼────────┐
│     TIER 1      │   │     TIER 2      │                           │     TIER 3      │   │     TIER 4      │
│ Feature Coverage│   │ Boundary/Corner │                           │  Combinatorial  │   │   Workloads     │
│  (R1 - R6)      │   │  Edge Cases     │                           │  Cross-Feature  │   │  User Journeys  │
│ tests/tier1_... │   │ tests/tier2_... │                           │ tests/tier3_... │   │ tests/tier4_... │
└─────────────────┘   └─────────────────┘                           └─────────────────┘   └─────────────────┘
```

### 4.1 Tier 1: Feature Coverage (>=5 Tests per Feature for R1–R6: 30+ Tests Total)
- **Feature R1 (Admin Authentication & Dynamic Whitelist)**:
  1. `T1.R1.1`: Super Admin email match via `EXPO_PUBLIC_ADMIN_EMAIL` grants `isAdmin = true` and `isSuperAdmin = true`.
  2. `T1.R1.2`: Dynamic whitelist match in Firestore `admins` collection grants `isAdmin = true` (non-super).
  3. `T1.R1.3`: Non-whitelisted regular user login yields `isAdmin = false`.
  4. `T1.R1.4`: Super Admin adds email to Firestore `admins` whitelist collection.
  5. `T1.R1.5`: Super Admin removes email from Firestore `admins` whitelist collection.
  6. `T1.R1.6`: User sign-out immediately revokes admin privileges and resets `isAdmin` to false.
- **Feature R2 (Admin Panel UI & Hidden Navigation)**:
  1. `T1.R2.1`: `DrawerContent.tsx` conditionally renders "Mission Control" with Feather `shield` icon only when `isAdmin === true`.
  2. `T1.R2.2`: AST audit of `AdminScreen.tsx` verifies all 4 required sections (Flashcards, Pipeline, API Usage, Settings & Config).
  3. `T1.R2.3`: Zero emoji violations and strict Feather vector icon usage across all admin components.
  4. `T1.R2.4`: Dark theme token adherence (`colors.bg`, `colors.card`, `colors.cardBorder`, `colors.text`, `colors.primary`).
  5. `T1.R2.5`: Touch target accessibility compliance (`>= 48x48px` or `hitSlop`) on all buttons, tabs, and interactive controls.
  6. `T1.R2.6`: `RootNavigator.tsx` registers `AdminScreen` and guards unauthorized entry.
- **Feature R3 (Flashcard Manager — Inline CRUD)**:
  1. `T1.R3.1`: Flashcard list renders all 10 topics from `dailyFeed.json` grouped cleanly.
  2. `T1.R3.2`: Inline edit mode allows editing catchy title, summary, and source URL.
  3. `T1.R3.3`: Saving flashcard edits persists override to Firestore `content` collection.
  4. `T1.R3.4`: Deleting flashcard requires confirmation and marks card as deleted in Firestore `content`.
  5. `T1.R3.5`: Search and filter bar correctly filters flashcards by title, summary, and topic slug.
  6. `T1.R3.6`: Precedence logic: Firestore `content` collection overrides static `dailyFeed.json` on app startup.
- **Feature R4 (Pipeline Control & Monitoring)**:
  1. `T1.R4.1`: "Trigger Fetch" button for each of the 10 topics creates a document in Firestore `pipeline_queue` collection.
  2. `T1.R4.2`: Pipeline run metadata reader correctly parses and displays last run timestamp, paper counts, and duration from `pipeline_runs`.
  3. `T1.R4.3`: Error logging and display: failed topic runs in `pipeline_runs` render with visual error badges and details.
  4. `T1.R4.4`: Backend `fetchAndSummarize.js` logs execution status and topic counts to Firestore `pipeline_runs` upon completion.
  5. `T1.R4.5`: Backend queue processor detects and processes pending topic requests from `pipeline_queue`.
- **Feature R5 (API Usage Dashboard)**:
  1. `T1.R5.1`: Backend `llm.js` logs API call outcomes (provider, status, timestamp, tokens) to Firestore `api_usage` collection.
  2. `T1.R5.2`: Multi-provider logging accurately records Gemini, Mistral, and Grok (xAI) calls and fallback cascades.
  3. `T1.R5.3`: API usage dashboard aggregates raw call logs into daily summary table (Date | Provider | Total | Success | Failure).
  4. `T1.R5.4`: Success and failure rate calculations handle zero-call days and provider-specific error distributions.
  5. `T1.R5.5`: Log sanitization ensures API keys and bearer tokens are never persisted in `api_usage` documents.
- **Feature R6 (System Prompt Editor & Whitelist Manager)**:
  1. `T1.R6.1`: Settings section loads system prompt from Firestore `doc(db, 'config', 'prompts')` with fallback to default prompt.
  2. `T1.R6.2`: Admin updates system prompt in UI and persists changes to Firestore `config` document.
  3. `T1.R6.3`: Backend `llm.js` reads dynamic prompt from Firestore at runtime during title generation.
  4. `T1.R6.4`: Backend `llm.js` falls back gracefully to hardcoded prompt if Firestore is offline or config document is missing.
  5. `T1.R6.5`: Dynamic admin email whitelist manager lists all current admins with Super Admin distinction.
  6. `T1.R6.6`: Whitelist manager validates email syntax before saving to `admins` collection.

### 4.2 Tier 2: Boundary & Corner Cases (>=5 Tests per Feature for R1–R6: 30+ Tests Total)
- **Boundary R1**:
  1. `T2.R1.1`: Email case-insensitivity (`SUPER@ADMIN.COM` vs `super@admin.com`).
  2. `T2.R1.2`: Email leading/trailing whitespace handling.
  3. `T2.R1.3`: Empty `EXPO_PUBLIC_ADMIN_EMAIL` in environment results in safe fallback (no unintended admin elevation).
  4. `T2.R1.4`: Corrupted or non-array data in Firestore `admins` document.
  5. `T2.R1.5`: Network drop during whitelist check falls back to env-var check or safe denial.
- **Boundary R2**:
  1. `T2.R2.1`: Complete absence of "Mission Control" text or HTML nodes in rendered DOM when non-admin logged in.
  2. `T2.R2.2`: Rapid tab cycling between the 4 admin sections without state corruption or memory leaks.
  3. `T2.R2.3`: Deep link dispatch to `/Admin` route by unauthorized user redirects to `/Feed`.
  4. `T2.R2.4`: High-density screen layout resizing (320px mobile to 2560px ultra-wide) maintains card integrity.
  5. `T2.R2.5`: Zero raw unicode glyphs (`↗`, `✓`, `+`) in buttons across all admin sections.
- **Boundary R3**:
  1. `T2.R3.1`: Inline edit with 5,000+ char summary preserves complete string without truncation.
  2. `T2.R3.2`: Attempting to save empty catchy title or summary is rejected with inline validation.
  3. `T2.R3.3`: XSS and SQL injection payloads in flashcard text fields (`<script>`, `' OR 1=1`) are sanitized.
  4. `T2.R3.4`: Deleting all flashcards in a topic renders a graceful empty-topic state.
  5. `T2.R3.5`: Search query with regex tokens (`*`, `(`, `[`, `?`) does not throw regex evaluation errors.
- **Boundary R4**:
  1. `T2.R4.1`: Rapid clicking "Trigger Fetch" button (debounce prevents duplicate queue documents).
  2. `T2.R4.2`: Pipeline run with 100% API failure rate logs failure gracefully to `pipeline_runs` without throwing unhandled exceptions.
  3. `T2.R4.3`: Empty or uninitialized `pipeline_runs` collection on fresh install renders "No runs recorded yet".
  4. `T2.R4.4`: Huge error stack traces in `pipeline_runs` are safely wrapped in scrollable/collapsible view.
  5. `T2.R4.5`: Triggering topic fetch with unknown topic slug rejected by validation.
- **Boundary R5**:
  1. `T2.R5.1`: Empty `api_usage` collection handles aggregation without `NaN` or zero-division errors.
  2. `T2.R5.2`: High-volume aggregation (1,000+ API log entries grouped across 30 days) computes efficiently.
  3. `T2.R5.3`: Error message with embedded API key (`?key=AIza...`) is stripped before logging to `api_usage`.
  4. `T2.R5.4`: Clock skew / future timestamps in log entries handled gracefully in daily buckets.
  5. `T2.R5.5`: Unknown provider strings in log records mapped to "Other / Unknown" column.
- **Boundary R6**:
  1. `T2.R6.1`: System prompt missing `{title}` or `{summary}` placeholders alerts user before saving.
  2. `T2.R6.2`: Extremely long system prompt (10,000+ characters) persists without truncation.
  3. `T2.R6.3`: Attempting to delete Super Admin email from whitelist fails with immutable restriction alert.
  4. `T2.R6.4`: Adding invalid email strings (`invalid`, `@domain.com`, `user@`) rejected by email regex.
  5. `T2.R6.5`: Offline prompt save attempts surface user-friendly network error dialog.

### 4.3 Tier 3: Cross-Feature Combinations & Integrations
- **Combination 3.1: Full Admin Lifecycle & Whitelist Delegation**:
  - Super Admin signs in -> Whitelists new admin `editor@reopsy.com` -> `editor` signs in -> gains `isAdmin` -> opens Mission Control -> edits flashcard in Flashcard Manager -> saves to Firestore `content` -> verifies change reflected in Feed -> Super Admin removes `editor` from whitelist -> `editor` session downgraded.
- **Combination 3.2: Dynamic System Prompt Modification + Pipeline Run + API Usage Logging**:
  - Admin modifies title generation prompt in Config Editor -> saves to Firestore `config/prompts` -> Admin triggers pipeline fetch for `ml` topic -> Pipeline reads new prompt from Firestore -> calls Gemini -> logs API call to `api_usage` -> logs run summary to `pipeline_runs` -> Admin verifies updated status in Pipeline Control & API Usage Dashboard.
- **Combination 3.3: Flashcard Inline CRUD + Static Feed Fallback + User Feed Hydration**:
  - Admin edits catchy title of paper in Flashcard Manager -> writes override to Firestore `content` -> Regular user opens app -> App loads `dailyFeed.json` and merges Firestore `content` overrides -> User sees updated catchy title -> User bookmarks paper -> Bookmark persists in `/users/{uid}` without conflicting with admin override.
- **Combination 3.4: Security Isolation & Firestore Rules Enforcement**:
  - Non-authenticated user attempts read/write to `/admins`, `/config`, `/content`, `/pipeline_runs`, `/pipeline_queue`, `/api_usage` -> Firestore rules block with `PERMISSION_DENIED` -> Authenticated non-admin attempts write to `/config` -> blocked -> Whitelisted admin writes to `/pipeline_queue` -> allowed.
- **Combination 3.5: Offline Degradation & Multi-Provider Fallback Resilience**:
  - Admin triggers pipeline while Gemini quota exceeded -> Backend logs Gemini 429 failure in `api_usage` -> Falls back to Mistral -> Mistral succeeds -> logs Mistral success in `api_usage` -> logs completed run to `pipeline_runs` -> Admin dashboard accurately reflects 1 failure and 1 success for the run.

### 4.4 Tier 4: Real-World Scenarios & Workloads
- **Scenario 4.1: Super Admin Complete Day-in-the-Life Workload**:
  - Super Admin signs in with Google Auth (`EXPO_PUBLIC_ADMIN_EMAIL`).
  - Drawer unlocks "Mission Control" entry with `shield` icon.
  - Navigates to Mission Control -> reviews Pipeline Control status.
  - Triggers pipeline fetch for `cv` and `ai-health` topics.
  - Navigates to Flashcard Manager -> searches "Attention" -> inline edits catchy title -> saves to Firestore `content`.
  - Deletes an outdated flashcard with confirmation dialog.
  - Navigates to API Usage Dashboard -> checks 7-day provider metrics and error rates.
  - Navigates to Settings & Config -> adds assistant admin email -> tunes system prompt template -> saves to Firestore.
  - Signs out -> Mission Control instantly disappears from drawer.
- **Scenario 4.2: Regular User Intrusion Attempt & Zero-Leakage Verification**:
  - Regular user logs in with non-admin Google account.
  - App verifies email against `EXPO_PUBLIC_ADMIN_EMAIL` and `admins` collection -> `isAdmin = false`.
  - Drawer displays only user options (Feed, Personalize, Saved, Settings).
  - DOM tree search confirms "Mission Control", "Pipeline Control", "Flashcard Manager", "API Usage", "Prompt Editor" strings are completely absent from DOM.
  - Attempted navigation to `Admin` route redirects to `Feed`.
  - Direct Firestore queries to `/admins` or `/config` blocked by security rules.
- **Scenario 4.3: Automated Ingest Pipeline Execution with Admin Queue & Logging**:
  - Ingest cron executes on backend.
  - Reads pending topic requests from Firestore `pipeline_queue`.
  - Fetches dynamic prompt template from Firestore `config/prompts`.
  - Queries OpenAlex and arXiv for target topics.
  - Generates catchy titles via LLM, logging each request to Firestore `api_usage`.
  - Inserts papers into SQLite DB and generates `dailyFeed.json`.
  - Logs pipeline run summary (counts, duration, errors) to Firestore `pipeline_runs`.
  - Clears processed queue items from `pipeline_queue`.

---

## 5. Caveats

1. **Static Frontend on Render vs. Backend Queue Processing**:
   - The frontend Expo web app is deployed as a static build on Render. Direct server-side process spawning from the browser is impossible. Writing topic fetch triggers to the Firestore `pipeline_queue` collection is the correct decoupled asynchronous bus architecture.
2. **Client-Side vs. Security Rules Admin Enforcement**:
   - Client-side checks in `useAuth` protect UI visibility and routing. However, client-side code can be modified in browser devtools. Therefore, Firestore security rules at `app/firestore.rules` must be the authoritative barrier blocking unauthorized read/write operations to `admins`, `config`, `pipeline_runs`, and `api_usage`.
3. **Firestore Mocking in Automated E2E Test Suite**:
   - Automated tests in `tests/` run in CI/CD without requiring live Firebase credentials. The `MockFirestore` helper simulates all Firestore operations (`setDoc`, `getDoc`, `deleteDoc`, `collection`, `getDocs`, `addDoc`, `query`, `where`, `orderBy`).
4. **Precedence Architecture for Flashcard Edits**:
   - Static `dailyFeed.json` is bundled at build time. When an admin edits a flashcard, it is persisted to Firestore `content` collection. The app's `AppState` must load `dailyFeed.json` and apply all active `content` overrides on initialization so edits persist across sessions and survive pipeline regenerations.

---

## 6. Conclusion

- **Full Feature Inventory**: All 6 requirements (R1–R6) have been analyzed with exact functional boundaries, file locations, data schemas, and edge cases.
- **Interface Contracts**: Concrete contracts for Firestore collections (`admins`, `config`, `content`, `pipeline_runs`, `pipeline_queue`, `api_usage`, `users`), environment variables, navigation routes, and `useAuth` hook signatures are fully specified.
- **4-Tier E2E Testing Strategy**: A complete 4-tier testing architecture (30+ Tier 1 feature tests, 30+ Tier 2 boundary tests, 5 Tier 3 cross-feature combinations, and 3 Tier 4 real-world user journeys) is designed and ready for implementation in `tests/run_all_e2e.js` and dedicated tier test files.
- **Zero-DOM-Leakage Compliance**: Exact conditional rendering protocols are defined to ensure "Mission Control" and all administrative controls remain 100% invisible to regular users.

---

## 7. Verification Method

To independently verify the feature inventory, interface contracts, and testing framework:

1. **TypeScript Typecheck**:
   ```bash
   cd app && npx tsc --noEmit
   ```
2. **Expo Web Build Verification**:
   ```bash
   cd app && npx expo export -p web
   ```
3. **Master E2E Test Suite Execution (All 4 Tiers)**:
   ```bash
   node tests/run_all_e2e.js
   ```
4. **Individual Tier Test Executions**:
   ```bash
   node --test tests/tier1_features.test.js
   node --test tests/tier2_boundaries.test.js
   node --test tests/tier3_combinatorial.test.js
   node --test tests/tier4_workloads.test.js
   ```
5. **DOM Leakage & AST Compliance Audit**:
   - Inspect `tests/helpers/astAuditor.js` and run AST audits for zero emoji literals, >=48px touch targets, and conditional rendering of "Mission Control".
