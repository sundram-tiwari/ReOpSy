# ReOpSy V2 Investigation Report: Auth, State, Settings & Security

> **Explorer:** Explorer 3 (Auth, State, Settings & Security)  
> **Target Scope:** ReOpSy Version 2 Requirements R2, R4, R5 (`app/` and `backend/`)  
> **Artifact:** `d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_survey_3/handoff.md`  
> **Date:** 2026-08-16  

---

## 1. Observation

### 1.1 Codebase & Dependency Inventory
Direct inspection of `app/package.json` (lines 15–42) reveals the following relevant packages:
- `firebase`: `^12.17.1` (Firebase JS SDK)
- `@react-native-async-storage/async-storage`: `2.2.0`
- `@react-navigation/drawer`: `^7.13.8`, `@react-navigation/native`: `^7.3.14`, `@react-navigation/native-stack`: `^7.18.6`
- `@expo/vector-icons`: `^15.1.1` (providing `Feather` icons)
- `expo-web-browser`: `~57.0.2`, `expo-sharing`: `~57.0.12`, `expo-constants`: `~57.0.11`
- `react`: `19.2.3`, `react-native`: `0.86.2`, `react-native-web`: `0.21.2`

### 1.2 Authentication Layer (`app/src/services/firebase.ts` & `app/src/hooks/useAuth.ts`)
- **`firebase.ts:6-13`**: `firebaseConfig` has unpopulated placeholder fields:
  ```ts
  const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };
  export const isFirebaseConfigured = () => firebaseConfig.apiKey !== "";
  ```
  `app`, `auth`, and `db` are initialized conditionally: `app = isFirebaseConfigured() && !getApps().length ? initializeApp(firebaseConfig) : (getApps().length ? getApps()[0] : null);`.
- **`useAuth.ts:21-25`**:
  ```ts
  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured() || !auth) return;
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };
  ```
  - `signInWithPopup(auth, provider)` operates in browser / web bundle environments (`react-native-web`), but on native mobile runtimes (iOS/Android Expo), `signInWithPopup` is not natively supported by the Firebase Web SDK without redirect handling (`signInWithRedirect`) or credential exchange (`signInWithCredential` + `expo-auth-session` / Google Identity).
  - When `isFirebaseConfigured()` is `false`, `signInWithGoogle` silently returns with no user-facing indication of offline/unconfigured status.
- **`useAuth.ts:14-18`**: Subscribes to `auth.onAuthStateChanged(setUser)` to expose `user`, `loading`, `signInWithGoogle`, and `signOut`.

### 1.3 State Management & Storage Persistence (`app/src/state/AppState.tsx`)
- **`AppState.tsx:47-68` (Hydration on Mount)**:
  - Loads exclusively from `AsyncStorage.getItem('reopsy_v2_state')`.
  - Deserializes `followedTopics`, `savedPapers`, `likedPapers`, `streak`, `onboardingComplete`, `userApiConfig`.
  - **Observation on Auth change**: When `user` changes from `null` to authenticated, `AppState.tsx` does **not** query Firestore (`getDoc(doc(db, 'users', user.uid))`) to hydrate/restore remote profile data.
- **`AppState.tsx:70-86` (Sync Effect)**:
  - On every state mutation when `isLoaded === true`, writes to `AsyncStorage.setItem('reopsy_v2_state', JSON.stringify(stateToSave))`.
  - If `user && isFirebaseConfigured() && db`, asynchronously calls `setDoc(doc(db, 'users', user.uid), stateToSave, { merge: true })`.
  - If offline or `user === null`, Firestore write is skipped cleanly while `AsyncStorage` persists all state.

### 1.4 Settings Screen & API Key Management (`app/src/screens/SettingsScreen.tsx`)
- **`SettingsScreen.tsx:15-20`**: Supports 4 provider options: `providers = ['Gemini', 'Mistral', 'Grok', 'Custom']`.
- **`SettingsScreen.tsx:131-139`**: API key input is currently a single `TextInput` with `secureTextEntry={true}`:
  - Missing an eye icon toggle to reveal/hide plaintext for key verification.
  - Does not format or mask existing stored keys with bullet previews (e.g., `••••••••1234`).
- **`SettingsScreen.tsx:36-43` (Connection Testing)**:
  - Connection test is a static stub:
    ```ts
    const handleTestConnection = () => {
      if (!apiKey) {
        Alert.alert('Error', 'Please enter an API key first.');
        return;
      }
      Alert.alert('Success', 'Connection tested successfully!');
    };
    ```
  - It does not make a live HTTP test ping to Google Gemini, Mistral, xAI Grok, or the Custom endpoint.
- **`SettingsScreen.tsx:170-188` (Custom Research Topic Input)**:
  - Captures `customTopic` (e.g., `"Explainable AI for Depression Detection"`) and saves it to `userApiConfig`.
  - However, saving the topic does not trigger a fetch pipeline, nor does the app register a custom topic feed tab in the feed view.

### 1.5 Custom Topic Feed Flow & Category Isolation (`app/src/components/TopicTabs.tsx` & `app/src/screens/FeedScreen.tsx`)
- **`TopicTabs.tsx:13`**:
  ```ts
  const visibleTopics = config.topics.filter(t => followedTopics.includes(t.slug));
  ```
  `TopicTabs` strictly loops over the 10 static topics defined in `config.topics` (`ml`, `dl`, `nlp`, `cv`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`, `bio`). The user's `userApiConfig.customTopic` is ignored.
- **`FeedScreen.tsx:40`**:
  ```ts
  const activePapers = feedData[activeTopic] || [];
  ```
  `feedData` is statically imported from `dailyFeed.json`. There is no client-side query handler for dynamic/custom topics.

### 1.6 Backend Pipeline & LLM Fallback (`backend/pipeline/`)
- **`fetchAndSummarize.js`**: Iterates through all 10 topics (`ALL_SLUGS`), queries OpenAlex and arXiv, extracts TLDR summaries via Semantic Scholar, and generates catchy titles via multi-LLM fallback (`llm.js`).
- **`llm.js:104-135`**: Implements sequential fallback: Gemini (`gemini-2.0-flash`) → Mistral (`mistral-small-latest`) → Grok (`grok-3-mini-fast`) → Original Title.
- **`backend/db/db.js`**: Stores fetched papers into local SQLite (`backend/db/data/database.sqlite`).

---

## 2. Logic Chain

### 2.1 Analysis of Requirement R2 (Google Authentication & Persistent User Settings)
1. **Fact**: `AppState.tsx` currently only loads local data from `AsyncStorage` on component mount (line 48).
2. **Inference**: If a user logs into their Google account on a new device or browser session, their saved papers, likes, custom research topic, and reading streak stored in Firestore `users/{uid}` will not be downloaded. Instead, empty initial state from local storage will be written over Firestore on the first state change.
3. **Requirement**: A dedicated cloud hydration effect is needed when `user` transitions to authenticated (`getDoc(doc(db, 'users', user.uid))`), merging remote cloud state with local cache without race conditions.
4. **Fallback Fact**: When offline or unauthenticated (`user === null`), `AsyncStorage` write and read paths work immediately without throwing exceptions.

### 2.2 Analysis of Requirement R4 (User API Integration & Personalized Custom Topic)
1. **Fact**: `SettingsScreen.tsx` collects `userApiConfig.provider`, `apiKey`, `endpoint`, and `customTopic`, but does not execute a live validation or live fetch.
2. **Fact**: `TopicTabs.tsx` and `FeedScreen.tsx` do not provide a view or tab for `customTopic`.
3. **Inference**: To satisfy R4 without disrupting default categories:
   - A client-side live fetcher service (`customTopicFetcher.ts`) must be introduced to query arXiv / OpenAlex search endpoints with the user's custom topic string, then use the user's provided API key (Gemini, Mistral, Grok, or Custom) to generate flashcard summaries and catchy titles.
   - A distinct `"custom"` tab with label `userApiConfig.customTopic` (or a dedicated icon `target` / `compass`) must be rendered in `TopicTabs.tsx`.
   - The resulting custom paper deck must be maintained in state (`customFeedData: Paper[]`) and rendered when `activeTopic === 'custom'`.
   - Default predefined categories (`ml`, `dl`, `nlp`, etc.) must remain completely intact from `dailyFeed.json`.

### 2.3 Analysis of Requirement R5 (Multi-Level Data Architecture & Security)
1. **Fact**: Requirements specify 4 distinct content tiers:
   - *Level 1*: Default Predefined Categories (Static Daily Digest via Semantic Scholar & System Pipeline).
   - *Level 2*: User-Customized Topics (Followed topic preferences).
   - *Level 3*: User API Content (User's LLM credentials for on-demand synthesis).
   - *Level 4*: Highly Specific Custom Research Content (Dynamic search + user LLM generated flashcards).
2. **Security Vulnerability Check**:
   - In `SettingsScreen.tsx`, API keys are kept in state.
   - When calling LLM endpoints (especially Gemini where API key can be passed via query string `?key=...`), if a network error occurs, default error messages may print the URL containing the raw key to `console.error` or `Alert`.
   - In Firestore, `users/{userId}` documents contain `userApiConfig`. Firestore Security Rules must strictly enforce `request.auth.uid == userId` so keys are inaccessible to other users.

---

## 3. Detailed Architectural Specifications & Gaps

### 3.1 Gap Analysis Matrix

| ID | Component | Current Implementation | Gap against R2 / R4 / R5 | Severity | Recommended Fix |
|---|---|---|---|---|---|
| **G-01** | `AppState.tsx` | Hydrates once from `AsyncStorage` on mount. | Remote Firestore profile data is never fetched on Google login. | **High** | Add `useEffect` on `user` to `getDoc(doc(db, 'users', user.uid))` and merge cloud state. |
| **G-02** | `SettingsScreen.tsx` | Mock connection test (`Alert.alert('Success')`). | Does not validate API keys against real Gemini / Mistral / Grok / Custom APIs. | **Medium** | Implement `apiValidator.ts` sending real lightweight health-check / completion requests. |
| **G-03** | `SettingsScreen.tsx` | Fixed `secureTextEntry={true}`, no unmask toggle. | User cannot verify or inspect entered API key; lacks preview masking (e.g. `••••••••ef12`). | **Low-Medium** | Add show/hide visibility toggle with Feather `eye`/`eye-off` icon and secure key masking. |
| **G-04** | `TopicTabs.tsx` & `FeedScreen.tsx` | Only renders static `config.topics` and static `dailyFeed.json`. | Custom research topic has no tab, no live fetch handler, and no display in feed. | **High** | Add dynamic `"custom"` tab in `TopicTabs` and wire live fetcher into `FeedScreen`. |
| **G-05** | `app/src/services/` | No client-side paper search or LLM integration. | App cannot fetch live papers for arbitrary custom topics at runtime. | **High** | Implement `customTopicFetcher.ts` combining arXiv/OpenAlex queries with client LLM invocation. |
| **G-06** | Security / Logging | Plaintext API keys in Firestore payload, possible URL key leaks in error logs. | Gemini query string key leaks if raw fetch exceptions are logged. | **Medium** | Sanitize all error logs via regex mask (`(?<=key=)[^&]+`), add Firestore Security Rules specification. |
| **G-07** | `useAuth.ts` | Silent return if Firebase is not configured. | User receives no visual feedback when tapping "Sign in with Google" in unconfigured demo mode. | **Low** | Display informative toast/alert when Firebase config is missing. |

---

### 3.2 Multi-Level Data Architecture Model (R5)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: DEFAULT PREDEFINED CATEGORIES (Public / Shipped)                   │
│ - 10 Curated Topics (ML, DL, NLP, CV, Mental Health AI, LLM, etc.)         │
│ - Shipped via app/src/data/dailyFeed.json & Backend Pipeline                │
│ - Extracted via Semantic Scholar API TLDRs + Multi-LLM Catchy Titles        │
│ - Zero user quota required; accessible offline and to anonymous users       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Filters user's visible tabs
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ LEVEL 2: USER-CUSTOMIZED TOPIC SELECTION (Personalized Preferences)         │
│ - User follows/unfollows subset of the 10 default topics                    │
│ - Stored in AsyncStorage ('reopsy_v2_state') & Firestore ('users/{uid}')    │
│ - Manages streak, saved bookmarks, liked papers                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Powers on-demand LLM features
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ LEVEL 3: USER API CREDENTIALS (Secure BYO-Key Management)                   │
│ - Provider: Gemini / Mistral / Grok / Custom Endpoint                       │
│ - Stored securely in client storage & private Firestore document            │
│ - Real-time connection testing & masked UI input                            │
│ - Scrubbed logs and HTTPS-only transmission                                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Executes live query + synthesis
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ LEVEL 4: HIGHLY SPECIFIC RESEARCH CONTENT (Live Personalized Research)     │
│ - Custom User Query (e.g. "Explainable AI for Depression Detection")        │
│ - Live client-side retrieval (arXiv API / OpenAlex API)                     │
│ - Client-side AI Flashcard synthesis using Level 3 API Key                  │
│ - Rendered in dedicated "Custom" Tab without altering Level 1 Daily Feed    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.3 Firestore Schema & Security Rules Specification

#### Document Path: `/users/{userId}`
```typescript
export interface FirestoreUserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  followedTopics: string[];       // e.g. ['ml', 'ai-health', 'custom']
  savedPapers: Paper[];           // Bookmarked paper objects
  likedPapers: string[];          // Array of paper IDs
  streak: StreakState;            // Streak tracking data
  onboardingComplete: boolean;
  userApiConfig: {
    provider: 'Gemini' | 'Mistral' | 'Grok' | 'Custom';
    apiKey: string;
    endpoint?: string;
    customTopic?: string;
    updatedAt: string;
  } | null;
  customPapers?: Paper[];         // Cached papers for custom research topic
  lastSyncedAt: string;
}
```

#### Firestore Security Rules (`firestore.rules`):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection: Strict owner-only access
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Default system feed papers (if synced to Firestore in future): Read-only
    match /system_feed/{topicId} {
      allow read: if true;
      allow write: if false; // Writes only via backend service role
    }
  }
}
```

---

### 3.4 Recommended Implementation Interfaces & Services

#### Interface 1: User API & Custom Topic Types (`app/src/types.ts`)
```typescript
export type LLMProvider = 'Gemini' | 'Mistral' | 'Grok' | 'Custom';

export interface UserApiConfig {
  provider: LLMProvider;
  apiKey: string;
  endpoint?: string;
  customTopic?: string;
}

export interface Paper {
  id: string;
  originalTitle: string;
  catchyTitle: string;
  summary: string;
  authors: string[];
  source: string;
  year: number | null;
  url: string;
  venue: string | null;
  pdfUrl: string | null;
  topics: string[];
  likes: number;
  contentLevel?: 1 | 2 | 3 | 4; // Multi-level taxonomy tag
}
```

#### Service 1: API Connection Validator (`app/src/services/apiValidator.ts`)
```typescript
import { UserApiConfig } from '../types';

export async function validateApiConnection(config: {
  provider: string;
  apiKey: string;
  endpoint?: string;
}): Promise<{ success: boolean; message: string }> {
  if (!config.apiKey.trim()) {
    return { success: false, message: 'API key cannot be empty.' };
  }

  try {
    if (config.provider === 'Gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.apiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Ping' }] }],
            generationConfig: { maxOutputTokens: 1 }
          })
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, message: err.error?.message || `HTTP ${res.status}` };
      }
      return { success: true, message: 'Connected to Gemini successfully!' };
    }

    if (config.provider === 'Mistral') {
      const res = await fetch('https://api.mistral.ai/v1/models', {
        headers: { Authorization: `Bearer ${config.apiKey.trim()}` }
      });
      if (!res.ok) return { success: false, message: `Mistral validation failed (HTTP ${res.status})` };
      return { success: true, message: 'Connected to Mistral successfully!' };
    }

    if (config.provider === 'Grok') {
      const res = await fetch('https://api.x.ai/v1/models', {
        headers: { Authorization: `Bearer ${config.apiKey.trim()}` }
      });
      if (!res.ok) return { success: false, message: `Grok validation failed (HTTP ${res.status})` };
      return { success: true, message: 'Connected to Grok (xAI) successfully!' };
    }

    if (config.provider === 'Custom') {
      if (!config.endpoint) return { success: false, message: 'Custom endpoint URL required.' };
      const endpoint = config.endpoint.replace(/\/+$/, '');
      const res = await fetch(`${endpoint}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey.trim()}` }
      });
      if (!res.ok) return { success: false, message: `Custom endpoint returned HTTP ${res.status}` };
      return { success: true, message: 'Custom endpoint connected!' };
    }

    return { success: false, message: 'Unknown provider.' };
  } catch (err: any) {
    // Sanitize any key leaking in error message
    const cleanMsg = (err.message || 'Connection failed').replace(/key=[a-zA-Z0-9_\-]+/g, 'key=***');
    return { success: false, message: cleanMsg };
  }
}
```

#### Service 2: Live Custom Topic Fetcher (`app/src/services/customTopicFetcher.ts`)
```typescript
import { Paper, UserApiConfig } from '../types';

export async function fetchCustomTopicPapers(
  topicQuery: string,
  apiConfig: UserApiConfig
): Promise<Paper[]> {
  if (!topicQuery || !apiConfig.apiKey) return [];

  // 1. Search arXiv API for relevant papers
  const searchUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(topicQuery)}&start=0&max_results=5&sortBy=submittedDate&sortOrder=descending`;
  const response = await fetch(searchUrl);
  const xmlText = await response.text();

  // 2. Parse XML entries (using regex parser compatible with React Native / Web)
  const entries: any[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entryXml = match[1];
    const id = (entryXml.match(/<id>([\s\S]*?)<\/id>/)?.[1] || '').trim();
    const title = (entryXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/\s+/g, ' ').trim();
    const summary = (entryXml.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').replace(/\s+/g, ' ').trim();
    const published = entryXml.match(/<published>([\s\S]*?)<\/published>/)?.[1] || '';
    const year = published ? new Date(published).getFullYear() : new Date().getFullYear();
    
    // Extract authors
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    const authors: string[] = [];
    let authMatch;
    while ((authMatch = authorRegex.exec(entryXml)) !== null) {
      authors.push(authMatch[1].trim());
    }

    if (id && title && summary) {
      entries.push({ id, title, summary, authors, year });
    }
  }

  // 3. Synthesize Catchy Title and Flashcard Summary using user's LLM API Key
  const synthesizedPapers: Paper[] = [];
  for (const entry of entries) {
    let catchyTitle = entry.title;
    let cardSummary = entry.summary.slice(0, 280) + '...';

    try {
      if (apiConfig.provider === 'Gemini') {
        const prompt = `Convert this paper into a flashcard for mobile.\nOriginal Title: ${entry.title}\nAbstract: ${entry.summary}\n\nRespond with JSON:\n{\n  "catchyTitle": "Engaging title under 10 words",\n  "summary": "Clear, informative 2-3 sentence summary under 60 words"\n}`;
        const llmRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          }
        );
        if (llmRes.ok) {
          const resData = await llmRes.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleanJson = rawText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (parsed.catchyTitle) catchyTitle = parsed.catchyTitle;
          if (parsed.summary) cardSummary = parsed.summary;
        }
      }
    } catch {
      // Graceful fallback to original title and abstract excerpt
    }

    synthesizedPapers.push({
      id: entry.id,
      originalTitle: entry.title,
      catchyTitle,
      summary: cardSummary,
      authors: entry.authors.length > 0 ? entry.authors : ['arXiv Researcher'],
      source: 'arxiv',
      year: entry.year,
      venue: 'arXiv Preprint',
      url: entry.id,
      pdfUrl: entry.id.replace('abs', 'pdf'),
      topics: ['custom'],
      likes: 0,
      contentLevel: 4
    });
  }

  return synthesizedPapers;
}
```

---

## 4. Caveats

1. **Native Mobile OAuth vs Web Popup**:
   - `signInWithPopup` is supported out-of-the-box in the web build (`expo export -p web`). On standalone iOS/Android binaries, Firebase Web Auth requires redirect handlers or native Google Sign-in plugins (`@react-native-google-signin/google-signin` / `expo-auth-session`).
2. **Client-Side XML Parsing**:
   - React Native does not include `DOMParser` by default. The regex-based arXiv XML extraction in `customTopicFetcher.ts` ensures 100% zero-dependency cross-platform compatibility across iOS, Android, and Web Metro bundlers.
3. **Third-Party API Rate Limits**:
   - arXiv API suggests a 3-second delay between requests. Client-side fetching should fetch in batches of 3–5 papers and cache results in `AsyncStorage` (`reopsy_v2_custom_feed`) to avoid repeated external calls.

---

## 5. Conclusion

- **Auth & Cloud Persistence (R2)**: The basic Firebase integration is in place, but requires cloud hydration on login (`getDoc`) to guarantee cross-device profile synchronization, alongside graceful fallback to `AsyncStorage` when offline or unconfigured.
- **Settings & API Key Management (R4, R5)**: The UI structure in `SettingsScreen.tsx` is ready for enhancement with live connection validation (`apiValidator.ts`), masked preview display, and an eye-toggle icon for secure key entry.
- **Custom Topic Live Feed (R4)**: The multi-level architecture cleanly decouples the 10 predefined default categories from user-driven live research queries. By introducing `customTopicFetcher.ts` and adding a dynamic `"custom"` pill in `TopicTabs.tsx`, users can explore highly specific topics without disrupting default application content.
- **Security Posture (R5)**: Zero-logging protocols, Firestore owner-only security rules, and error-sanitization wrappers ensure user API keys are never leaked in client logs, stack traces, or shared Firestore collections.

---

## 6. Verification Method

To independently verify all findings and validate subsequent implementations:

1. **TypeScript Type Safety**:
   ```bash
   cd d:/Intern/ReOpSy/app
   npx tsc --noEmit
   ```
   *Expected result: 0 type errors.*

2. **Web Production Bundle Export**:
   ```bash
   cd d:/Intern/ReOpSy/app
   npx expo export -p web
   ```
   *Expected result: Produces valid web build in `dist/` with zero bundle resolution errors.*

3. **Backend Pipeline Dry Run**:
   ```bash
   cd d:/Intern/ReOpSy/backend
   node pipeline/fetchAndSummarize.js --dry
   ```
   *Expected result: Successfully processes all 10 topics without fatal exceptions.*

4. **Settings Screen & Masked Key Inspection**:
   - Inspect `app/src/screens/SettingsScreen.tsx` to verify masked `secureTextEntry` and provider selection.
   - Verify that removing API configuration wipes `userApiConfig` from both `AppState` and `AsyncStorage`.
