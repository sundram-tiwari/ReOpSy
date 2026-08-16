# Handoff Report — Backend Architecture, LLM Pipeline, and Firestore Security

**Agent**: Survey Explorer 2 (Backend & Security/Pipeline Specialist)  
**Date**: 2026-08-16T11:45:00Z  
**Target Workspace**: `d:/Intern/ReOpSy`  
**Handoff Type**: Hard (Complete Investigation & Architectural Specification)

---

## 1. Observation

### 1.1 Backend Pipeline & Ingest Architecture
- **Pipeline Entrypoint**: `backend/pipeline/fetchAndSummarize.js`
  - Line 6: `const { TOPICS, ALL_SLUGS } = require('../ingest/lib/topics');`
  - Line 25–32: Reads API keys `GEMINI_API_KEY`, `MISTRAL_API_KEY`, and `XAI_API_KEY` from `backend/.env`.
  - Line 47: Loops over `for (const topic of ALL_SLUGS) { ... }` sequentially.
  - Line 54: Fetches OpenAlex papers: `openalex.fetchTopic({ topic, limit: limitPerSource, fromDate })`.
  - Line 63: Fetches arXiv papers: `arxiv.fetchTopic({ topic, limit: limitPerSource })` followed by a 3000ms delay (`delay(3000)`).
  - Line 71–72: Deduplicates papers (`dedupe(collected)`), filters for valid papers with `(p.summary || p.abstract) && p.title && p.url`, taking up to 10 papers per topic.
  - Line 81–90: Summarization cascade: tries Semantic Scholar TLDR (`fetchTldr(p.title)`), falls back to abstract (`p.summary`), then rule-based fallback (`fallbackSummarize`), and finally `"No abstract available."`.
  - Line 92–93: Title generation: `const llmRes = await generateCatchyTitle(p.title, summary, apiKeys);`.
  - Line 109: Inserts into SQLite database via `insertPaper(topic, paperRecord)`.
  - Line 118–158: Fetches latest 10 papers per topic from SQLite (`getLatestPapersForTopic(topic, 10)`), with safety dummy card generation if DB is empty (lines 139–155).
  - Line 170–172: Writes final feed JSON to `app/src/data/dailyFeed.json`.

### 1.2 The 10 Predefined Research Topics
- Defined in `backend/ingest/lib/topics.js` (lines 10–71) and mirrored in `app/src/config.ts` (lines 3–14):
  1. `ml`: **Machine Learning** (`openalexFilter: 'concepts.id:C119857082'`, `arxivQuery: 'cat:cs.LG OR cat:stat.ML'`)
  2. `dl`: **Deep Learning** (`openalexFilter: 'concepts.id:C119857082'`, `arxivQuery: 'cat:cs.LG OR cat:cs.NE'`)
  3. `nlp`: **Language & NLP** (`openalexFilter: 'concepts.id:C204321447'`, `arxivQuery: 'cat:cs.CL'`)
  4. `cv`: **Computer Vision** (`openalexFilter: 'concepts.id:C31972630'`, `arxivQuery: 'cat:cs.CV'`)
  5. `ai-health`: **AI in Mental Health** (`openalexFilter: 'concepts.id:C119857082'`, `arxivQuery: 'cat:cs.AI AND (all:"mental health" OR all:"psychiatry" OR all:"therapy")'`)
  6. `llm`: **Large Language Models** (`openalexFilter: 'concepts.id:C204321447'`, `arxivQuery: 'cat:cs.CL AND (all:"large language model" OR all:"LLM")'`)
  7. `robotics`: **Robotics & Control** (`openalexFilter: 'concepts.id:C28881434'`, `arxivQuery: 'cat:cs.RO'`)
  8. `cybersecurity`: **Cybersecurity & AI** (`openalexFilter: 'concepts.id:C38652104'`, `arxivQuery: 'cat:cs.CR'`)
  9. `data-science`: **Data Science** (`openalexFilter: 'concepts.id:C11413529'`, `arxivQuery: 'cat:stat.ML OR cat:stat.AP'`)
  10. `bio`: **Computational Biology** (`openalexFilter: 'concepts.id:C70721500'`, `arxivQuery: 'cat:q-bio.QM OR cat:q-bio.GN OR cat:q-bio.BM'`)

### 1.3 LLM API Implementations & System Prompt
- File: `backend/pipeline/llm.js`
  - **Gemini**: `callGemini(prompt, apiKey)` (lines 6–48). Iterates models `['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash']` against endpoint `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}` with POST payload `{ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }`. Returns `data.candidates?.[0]?.content?.parts?.[0]?.text`. Token usage is available under `data.usageMetadata`.
  - **Mistral**: `callMistral(prompt, apiKey)` (lines 53–79). Calls `https://api.mistral.ai/v1/chat/completions` with headers `Authorization: Bearer ${apiKey}`, payload `{ model: 'mistral-small-latest', messages: [{ role: 'user', content: prompt }], temperature: 0.7 }`. Returns `data.choices?.[0]?.message?.content`. Token usage is available under `data.usage`.
  - **Grok (xAI)**: `callGrok(prompt, apiKey)` (lines 84–110). Calls `https://api.x.ai/v1/chat/completions` with headers `Authorization: Bearer ${apiKey}`, payload `{ model: 'grok-3-mini-fast', messages: [{ role: 'user', content: prompt }], temperature: 0.7 }`. Returns `data.choices?.[0]?.message?.content`. Token usage is available under `data.usage`.
  - **Fallback Execution Order**: `generateCatchyTitle` (lines 119–150): `Gemini -> Mistral -> Grok (xAI) -> Original Title`.
  - **Hardcoded System Prompt Location**: **Line 120** of `backend/pipeline/llm.js`:
    ```javascript
    const prompt = `Rewrite the following research paper title into a catchy, engaging title in under 10 words. Only return the new title, without quotes or additional text.\n\nOriginal Title: ${originalTitle}\nSummary: ${summary}`;
    ```

### 1.4 Current Firestore Rules & Client Setup
- **Firestore Rules**: Located at `app/firestore.rules` and root `firestore.rules` (identical content):
  ```javascript
  rules_version = '2';

  service cloud.firestore {
    match /databases/{database}/documents {
      // User profile, preferences, API keys, and bookmarks are strictly owner-only
      match /users/{userId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
  ```
- **App Dependencies & Firebase SDK**:
  - `app/package.json` contains `"firebase": "^12.17.1"`, `"react": "19.2.3"`, `"react-native": "0.86.2"`, `"expo": "~57.0.13"`.
  - `app/src/services/firebase.ts` initializes Firebase Auth and Firestore with client config from `EXPO_PUBLIC_FIREBASE_*` environment variables.
- **Backend Dependencies**:
  - `backend/package.json`: `"node-cron": "^4.6.0"`, `"sqlite3": "^6.0.1"`, `"engines": { "node": ">=18.17" }`. Currently has zero client Firebase packages installed.

---

## 2. Logic Chain

### 2.1 Implementing Firestore Logging Collections

#### A. Collection: `pipeline_runs`
- **Purpose**: Record run history, per-topic paper counts, errors, and timestamps so the admin panel (Pipeline Control tab) can display the last run status and per-topic breakdown.
- **Document Structure**:
  ```typescript
  interface PipelineRunRecord {
    id: string; // e.g. "run_1786878000000" or ISO timestamp
    timestamp: string; // ISO-8601 string (e.g. "2026-08-16T11:00:00.000Z")
    status: 'success' | 'partial' | 'failure';
    durationMs: number;
    topicsProcessed: number;
    totalPapers: number;
    perTopicCounts: Record<string, number>; // e.g. { "ml": 10, "dl": 10, "nlp": 8, ... }
    errors: Array<{
      topic?: string;
      stage?: string; // 'openalex' | 'arxiv' | 'llm' | 'db'
      error: string;
      timestamp: string;
    }>;
    trigger: 'scheduled' | 'manual_queue' | 'cli';
  }
  ```
- **Backend Integration in `fetchAndSummarize.js`**:
  1. Capture start time at function entry: `const startTime = Date.now();`
  2. Initialize run metrics: `const perTopicCounts = {}; const errors = [];`
  3. During loop over topics, record `perTopicCounts[topic] = validPapers.length;` and push caught errors to `errors.push({ topic, stage, error: err.message, timestamp: new Date().toISOString() });`
  4. At pipeline completion (before writing feed / exiting), persist document to Firestore `pipeline_runs` collection.
- **Frontend Query in AdminScreen**:
  `query(collection(db, 'pipeline_runs'), orderBy('timestamp', 'desc'), limit(5))` -> extracts `docs[0].data()` for status display.

#### B. Collection: `pipeline_queue`
- **Purpose**: Bridge static frontend (hosted on Render static web) and background pipeline execution.
- **Document Structure**:
  ```typescript
  interface PipelineQueueItem {
    id: string; // e.g. "queue_ml_1786878000000"
    topic: string; // topic slug, e.g. "ml", or "all"
    status: 'pending' | 'processing' | 'completed' | 'failed';
    requestedAt: string; // ISO-8601 string
    requestedBy: string; // Admin email
    processedAt: string | null;
    result?: {
      papersFetched: number;
      durationMs: number;
      error?: string | null;
    } | null;
  }
  ```
- **Workflow**:
  1. Admin clicks "Trigger Fetch" for topic "nlp" in Mission Control.
  2. Frontend calls `addDoc(collection(db, 'pipeline_queue'), { topic: 'nlp', status: 'pending', requestedAt: new Date().toISOString(), requestedBy: user.email, processedAt: null })`.
  3. Backend cron or trigger worker polls `pipeline_queue` for `status == 'pending'`, marks `status = 'processing'`, invokes `fetchAndSummarize({ topic: 'nlp' })`, and updates `status = 'completed'` with `processedAt` and counts.

#### C. Collection: `api_usage`
- **Purpose**: Track LLM invocations across providers (Gemini, Mistral, Grok), daily totals, success/failure rates, and token counts.
- **Document Structure (Event-level & Daily Aggregates)**:
  - **Event Record**:
    ```typescript
    interface ApiUsageRecord {
      id: string; // e.g. "usage_1786878000000_abc"
      date: string; // "YYYY-MM-DD"
      timestamp: string; // ISO-8601 string
      provider: 'gemini' | 'mistral' | 'xai';
      model: string; // e.g. "gemini-2.5-flash", "mistral-small-latest"
      success: boolean;
      error?: string | null;
      promptTokens?: number | null;
      completionTokens?: number | null;
      totalTokens?: number | null;
      durationMs?: number;
    }
    ```
- **Backend Logging in `llm.js`**:
  Inside each provider function (`callGemini`, `callMistral`, `callGrok`):
  - Extract token counts from response (`data.usageMetadata` for Gemini, `data.usage` for Mistral/Grok).
  - Record execution status (`success: true` or `success: false, error: err.message`).
  - Write usage log entry to Firestore `api_usage` collection asynchronously (`await logApiUsage(...)`).

#### D. Collection: `config` (Dynamic System Prompt Storage & Fallback)
- **Purpose**: Allow real-time editing of the AI system prompt via the Mission Control Settings section, without needing code changes or rebuilds.
- **Document ID**: `config/system_prompt`
- **Document Structure**:
  ```typescript
  interface SystemPromptConfig {
    promptTemplate: string;
    defaultPrompt: string;
    updatedAt: string;
    updatedBy: string; // Admin email
  }
  ```
- **Dynamic Retrieval with Fallback in `llm.js`**:
  ```javascript
  const DEFAULT_PROMPT_TEMPLATE = `Rewrite the following research paper title into a catchy, engaging title in under 10 words. Only return the new title, without quotes or additional text.\n\nOriginal Title: {originalTitle}\nSummary: {summary}`;

  async function getSystemPrompt(firestoreClient, originalTitle, summary) {
    let template = DEFAULT_PROMPT_TEMPLATE;
    if (firestoreClient) {
      try {
        const configDoc = await firestoreClient.getDoc('config', 'system_prompt');
        if (configDoc && configDoc.promptTemplate && configDoc.promptTemplate.trim() !== '') {
          template = configDoc.promptTemplate;
        }
      } catch (err) {
        console.warn(`[Config] Failed to fetch system_prompt from Firestore: ${err.message}. Using default.`);
      }
    }
    return template
      .replace('{originalTitle}', originalTitle)
      .replace('{summary}', summary);
  }
  ```

#### E. Collection: `admins` (Dynamic Whitelist)
- **Purpose**: Maintain authorized admin emails editable by the Super Admin.
- **Document ID Strategy**: Lowercase email address as document ID (e.g. `doc(db, 'admins', 'admin@example.com')`).
- **Document Structure**:
  ```typescript
  interface AdminRecord {
    email: string;
    role: 'superadmin' | 'admin';
    addedAt: string;
    addedBy: string;
  }
  ```
- **Client-Side Admin Authorization Logic in `useAuth.ts`**:
  1. If `user.email` matches `EXPO_PUBLIC_ADMIN_EMAIL` (normalized lowercase) -> `isAdmin = true`.
  2. Else, query Firestore `getDoc(doc(db, 'admins', user.email.toLowerCase()))`. If document exists -> `isAdmin = true`.
  3. Otherwise, `isAdmin = false`.

#### F. Collection: `content` (Flashcard Inline Edits Persistence)
- **Purpose**: Persist admin modifications to flashcard titles, summaries, and URLs so that edits survive pipeline re-runs.
- **Document ID**: Normalized paper ID (e.g. `encodeURIComponent(paper.id)` or `paper.id.replace(/[:/]/g, '_')`).
- **Document Structure**:
  ```typescript
  interface FlashcardOverride {
    id: string; // "arxiv:2608.13522"
    topic: string;
    originalTitle: string;
    catchyTitle: string;
    summary: string;
    source: string;
    url: string;
    pdfUrl: string | null;
    authors: string[];
    year: number | null;
    venue: string | null;
    isDeleted?: boolean;
    updatedAt: string;
    updatedBy: string;
  }
  ```
- **Pipeline Integration**:
  In `fetchAndSummarize.js`, before writing to `dailyFeed.json`, fetch all documents from `content` collection. For any paper matching an ID in `content`:
  - If `isDeleted === true`, filter out the paper from the topic list.
  - If modified, overwrite `catchyTitle`, `summary`, and `url` with admin-curated values.

---

### 2.2 Firestore Security Rules Design

The new security rules must enforce:
1. `/users/{userId}`: Strict owner-only access (existing app behavior).
2. `/admins/{email}`: Only authenticated admin users can read and write.
3. `/config/{configId}`: Only authenticated admin users can read and write.
4. `/api_usage/{usageId}`: Only authenticated admin users can read and write.
5. `/pipeline_runs/{runId}`: Only authenticated admin users can read and write.
6. `/pipeline_queue/{queueId}`: Only authenticated admin users can read and write.
7. `/content/{contentId}`: Read allowed for all (or authenticated users); write allowed only for authenticated admins.

#### Proposed `firestore.rules`:
```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: Check if user is authenticated via Firebase Auth
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper: Check if requesting user's email exists in the admins whitelist collection
    function isAdmin() {
      return isAuthenticated() && (
        exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower()))
      );
    }

    // 1. User Profiles & Local-First State Sync
    // Strictly owner-only read/write
    match /users/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }

    // 2. Admin Whitelist Collection
    // Admin-only read and write
    match /admins/{email} {
      allow read, write: if isAdmin();
    }

    // 3. System Configuration & Prompt Settings
    // Admin-only read and write
    match /config/{configId} {
      allow read, write: if isAdmin();
    }

    // 4. API Usage Telemetry & Daily Aggregates
    // Admin-only read and write
    match /api_usage/{usageId} {
      allow read, write: if isAdmin();
    }

    // 5. Pipeline Run Logs & Execution Metadata
    // Admin-only read and write
    match /pipeline_runs/{runId} {
      allow read, write: if isAdmin();
    }

    // 6. Pipeline Execution Trigger Queue
    // Admin-only read and write
    match /pipeline_queue/{queueId} {
      allow read, write: if isAdmin();
    }

    // 7. Content Overrides & Flashcard Edits
    // Public/App user read; Admin-only write
    match /content/{contentId} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

---

### 2.3 Backend Runtime & Firebase SDK Integration Analysis

#### Runtime Environment
- **Node.js**: `node: ">=18.17"` (`backend/package.json`). Native `fetch`, `node:test`, `crypto` available without polyfills.
- **Deployment Structure**:
  - `render.yaml` specifies a static web service publishing `app/dist`.
  - Backend pipeline runs as scheduled background jobs (GitHub Actions `ingest.yml` at `02:15 UTC` or local `node backend/pipeline/cron.js`).

#### Connecting Backend to Firestore
To log to Firestore from `backend/pipeline/fetchAndSummarize.js` and `backend/pipeline/llm.js`, there are three viable architectures:

1. **Option A: Lightweight Native REST Client (Recommended & Zero New Dependencies)**
   - Uses Node 18 native `fetch` against Firebase Firestore REST API:
     `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`
   - Can read/write Firestore documents with zero npm installs.
   - Handles `config` retrieval, `pipeline_runs` logging, `api_usage` logging, and `content` retrieval seamlessly.

2. **Option B: Standard Firebase Client SDK (`firebase` package)**
   - Add `"firebase": "^12.17.1"` to `backend/package.json`.
   - Uses the identical modular syntax (`doc`, `getDoc`, `setDoc`, `addDoc`) as the frontend in `app/src/services/firebase.ts`.

3. **Option C: Firebase Admin SDK (`firebase-admin`)**
   - Add `"firebase-admin": "^13.0.0"` with Google Cloud service account credentials.
   - Bypasses security rules with elevated server permissions.

---

## 3. Caveats
1. **Super Admin Seed Requirement**:
   In Firestore rules, `exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower()))` checks the `admins` collection in Firestore. When initializing the system, the Super Admin's email (from `EXPO_PUBLIC_ADMIN_EMAIL`) must have a corresponding document seeded into `/admins/<email>` (or created on first boot/deploy) so that Firestore security rules recognize the Super Admin immediately.
2. **Render Static Site vs. Pipeline Execution**:
   Render is hosting the Expo web build as a static site (`render.yaml`). Clicking "Trigger Fetch" from the browser cannot directly run `exec('node fetchAndSummarize.js')` on Render's static CDN. Enqueueing triggers into `pipeline_queue` via Firestore is the exact solution that allows asynchronous processing by backend cron jobs or workers.
3. **LLM Token Tracking**:
   Token usage fields vary slightly between providers:
   - Gemini returns `usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount }`.
   - Mistral and Grok return `usage: { prompt_tokens, completion_tokens, total_tokens }`.
   The logging helper in `llm.js` must normalize these provider-specific fields into `{ promptTokens, completionTokens, totalTokens }`.

---

## 4. Conclusion

1. **Pipeline & Topics**: All 10 topics (`ml`, `dl`, `nlp`, `cv`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`, `bio`) are defined in `backend/ingest/lib/topics.js` and `app/src/config.ts`. The pipeline in `backend/pipeline/fetchAndSummarize.js` already runs the full OpenAlex + arXiv + Semantic Scholar + LLM workflow and outputs `app/src/data/dailyFeed.json`.
2. **System Prompt**: Hardcoded at `backend/pipeline/llm.js:120`. It can be dynamically queried from Firestore `config/system_prompt` with an immediate fallback to the hardcoded default.
3. **Firestore Collections**: Designed schemas for `pipeline_runs`, `pipeline_queue`, `api_usage`, `config`, `admins`, and `content`.
4. **Security Rules**: Designed `firestore.rules` using `isAdmin()` verification against `/admins/$(email)` to strictly secure all admin collections while leaving `/users/{userId}` owner-only and `/content` read-safe.

---

## 5. Verification Method

To independently verify all findings and architectural specifications:

1. **Verify Topic Slugs & Config**:
   - Inspect `backend/ingest/lib/topics.js` lines 10–71.
   - Inspect `app/src/config.ts` lines 3–14.
   - Confirm 10 topics match in both files.

2. **Verify System Prompt & LLM Fallback**:
   - Inspect `backend/pipeline/llm.js` lines 6–150.
   - Confirm prompt definition on line 120.
   - Confirm model lists and endpoints for Gemini, Mistral, and Grok.

3. **Verify Security Rules Compliance**:
   - Inspect `app/firestore.rules`.
   - Validate that `/admins`, `/config`, `/api_usage`, `/pipeline_runs`, `/pipeline_queue`, and `/content` follow the admin-restricted design.

4. **Verify TypeScript & Web Export Buildability**:
   - `cd app && npx tsc --noEmit`
   - `cd app && npx expo export -p web`
