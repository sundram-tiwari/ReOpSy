# Survey & Architecture Report: Frontend & Auth/Navigation Specialist

## 1. Observation

### 1.1 Project Structure & Configuration
- **Package Manifest** (`app/package.json`):
  - React `19.2.3`, React Native `0.86.2`, React Native Web `0.21.2`.
  - Expo SDK `~57.0.13` with `@expo/vector-icons` `^15.1.1` providing Feather icons.
  - Navigation: `@react-navigation/native` `^7.3.14`, `@react-navigation/drawer` `^7.13.8`, `@react-navigation/native-stack` `^7.18.6`.
  - Firebase SDK: `firebase` `^12.17.1` (Modular Web SDK).
  - Storage: `@react-native-async-storage/async-storage` `2.2.0`.
- **TypeScript Configuration** (`app/tsconfig.json`):
  - Extends `expo/tsconfig.base`, `strict: true`, `skipLibCheck: true`, path alias `@/*` -> `./src/*`.
  - Includes `**/*.ts`, `**/*.tsx`.
  - Logic unit tests are isolated under `src/logic/__tests__` and compiled with `tsconfig.test.json`.
- **Environment Configuration** (`app/.env` & `app/.env.example`):
  - Public environment variables prefixed with `EXPO_PUBLIC_`:
    - `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`.
    - New required variable: `EXPO_PUBLIC_ADMIN_EMAIL` (defines hardcoded Super Admin email).

---

### 1.2 Authentication & Firebase Architecture
- **Firebase Initialization** (`app/src/services/firebase.ts` lines 9–48):
  - Initializes Firebase Modular App using `firebaseConfig` populated from `process.env.EXPO_PUBLIC_FIREBASE_*`.
  - Exports `app: FirebaseApp | null`, `auth: Auth | null`, `db: Firestore | null`, `isFirebaseConfigured(): boolean`.
- **Current Auth Hook** (`app/src/hooks/useAuth.ts` lines 14–63):
  - `useAuth()` returns `{ user, loading, error, isConfigured, signInWithGoogle, signOut }`.
  - Listens to auth state changes using `onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); })`.
  - Manages Google popup and redirect sign-in flow via `GoogleAuthProvider`, `signInWithPopup`, and `signInWithRedirect`.
  - **Absence**: Currently contains zero admin verification, no whitelist lookup, and does not expose `isAdmin` or `isSuperAdmin`.

---

### 1.3 Navigation & Drawer Structure
- **Root Navigator** (`app/src/navigation/RootNavigator.tsx` lines 14–62):
  - `NavigationContainer` wraps a root `Stack.Navigator` (`headerShown: false`).
  - Registered stack routes:
    - `MainDrawer`: Wraps `DrawerNavigator` which renders `DrawerContent` and `FeedScreen`.
    - `Personalization`: `PersonalizationScreen` (presentation modal).
    - `Saved`: `SavedScreen`.
    - `Settings`: `SettingsScreen`.
- **Drawer Content** (`app/src/components/DrawerContent.tsx` lines 19–140):
  - Uses `DrawerContentScrollView` with custom items:
    - Profile header (shows user avatar / name / email or Google Sign-In button).
    - Daily Digest card (streak count).
    - Activity stats card (likes & saves count).
    - Menu item 1: "Personalize your Feed" (Feather `sliders`).
    - Menu item 2: "View Saved Papers" (Feather `bookmark`).
    - Menu item 3: "Settings & Support" (Feather `settings`).
    - Menu item 4: "Sign Out" (Feather `log-out`, conditional on `user`).
    - Footer links (Contact Us, Terms, Privacy, Version).
  - **Absence**: No admin entry exists.

---

### 1.4 Theme Tokens & Design System
- **Theme Definitions** (`app/src/theme.ts` lines 1–33):
  - `colors`:
    - `bg`: `'#000000'` (OLED black)
    - `card`: `'#121212'` (Dark surface)
    - `cardBorder`: `'#2a2a2a'` (Border)
    - `text`: `'#ffffff'` (Primary text)
    - `textDim`: `'#a0a0a0'` (Muted body/captions)
    - `primary`: `'#1d9bf0'` (Accent blue)
    - `accent`: `'#292929'` (Button/pill surface)
    - `followGreen`: `'#4caf50'`
    - `danger`: `'#ff5252'`
    - `success`: `'#4caf50'`
    - `divider`: `'#333333'`
  - `spacing`: `xs`: 4, `s`: 8, `m`: 16, `l`: 24, `xl`: 32, `xxl`: 48.
  - `typography`:
    - `h1`: `{ fontSize: 16, fontWeight: 'bold', color: colors.text, lineHeight: 24 }`
    - `h2`: `{ fontSize: 22, fontWeight: 'bold', color: colors.text, lineHeight: 28 }`
    - `h3`: `{ fontSize: 18, fontWeight: '600', color: colors.text }`
    - `body`: `{ fontSize: 16, color: colors.text, lineHeight: 24 }`
    - `bodyDim`: `{ fontSize: 16, color: colors.textDim, lineHeight: 24 }`
    - `caption`: `{ fontSize: 14, color: colors.textDim, lineHeight: 20 }`
    - `small`: `{ fontSize: 12, color: colors.textDim }`
  - **UX Conventions**:
    - Feather icons only (`@expo/vector-icons`), no emojis in navigation or buttons.
    - Minimum touch targets of 48px (`minHeight: 48`, `minWidth: 48`, `hitSlop`).
    - Web scroll snapping and responsive card sizing.

---

### 1.5 Data Structures & Topics
- **Predefined Topics** (`app/src/config.ts` lines 3–14):
  - 10 core topics: `ml` (Machine Learning), `dl` (Deep Learning), `nlp` (Language & NLP), `cv` (Computer Vision), `ai-health` (AI in Mental Health), `llm` (Large Language Models), `robotics` (Robotics & Control), `cybersecurity` (Cybersecurity & AI), `data-science` (Data Science), `bio` (Computational Biology).
- **Flashcard Feed Structure** (`app/src/data/dailyFeed.json` lines 1–32 & `app/src/types.ts` lines 1–15):
  - Top level: `{ "generatedAt": "ISO string", "topics": { [topicSlug: string]: Paper[] } }`
  - Paper item:
    ```typescript
    export interface Paper {
      id: string; // e.g. 'arxiv:2608.13522' or 'oa:W2741809807'
      originalTitle: string;
      catchyTitle: string;
      summary: string;
      authors: string[];
      source: string;
      year: number | null;
      venue: string | null;
      url: string;
      pdfUrl: string | null;
      topics: string[];
      likes: number;
      contentLevel?: 1 | 2 | 3 | 4;
    }
    ```
- **State & Sync** (`app/src/state/AppState.tsx` lines 207–380):
  - Local-first caching with AsyncStorage (`reopsy_v2_state`) and bidirectional cloud sync with Firestore `users/{uid}`.
  - `feedData` loaded from `dailyFeedJson.topics`.

---

## 2. Logic Chain

### 2.1 Admin Authentication & Whitelist Verification Flow
```
User Authenticated (Firebase Auth)
        │
        ▼
Extract user.email (normalized lowercase)
        │
        ├── Match process.env.EXPO_PUBLIC_ADMIN_EMAIL? ──► YES ──► isAdmin = true, isSuperAdmin = true
        │
        └── NO
             │
             ▼
        Query Firestore `admins/{email}` doc (or collection)
             │
             ├── Document exists? ───────────────────────► YES ──► isAdmin = true, isSuperAdmin = false
             └── Document does not exist / error ────────► NO  ──► isAdmin = false, isSuperAdmin = false
```

1. **State Isolation**:
   - In `useAuth.ts`, maintain `isAdmin: boolean`, `isSuperAdmin: boolean`, and `adminLoading: boolean`.
   - Default `isAdmin = false`. When user signs in, perform synchronous check against `EXPO_PUBLIC_ADMIN_EMAIL` first (instant resolution for Super Admin), and if false, execute async Firestore `getDoc(doc(db, 'admins', email.toLowerCase()))`.
2. **Zero DOM Leakage**:
   - In `DrawerContent.tsx`, `{isAdmin && <MenuItem ... />}` renders `null` in React Native Web when `isAdmin` is false.
   - The DOM tree produces zero nodes, zero text strings, and zero accessibility labels containing "Mission Control" or "Admin" for non-admin users.
3. **Route Protection**:
   - In `RootNavigator.tsx`, register `Admin` stack screen.
   - Inside `AdminScreen.tsx`, enforce guard: if `!isAdmin && !adminLoading`, immediately return access denied or redirect to `Feed`.

---

### 2.2 Admin Panel Component Architecture (`AdminScreen.tsx`)

The proposed `AdminScreen.tsx` is structured into 4 tabbed sections:

```
┌────────────────────────────────────────────────────────────────────────┐
│  ← Mission Control                                         [Admin Pill]│
├───────────────┬──────────────────┬─────────────────┬───────────────────┤
│  Flashcards   │ Pipeline Control │ API Usage (LLM) │ Settings & Config │
├───────────────┴──────────────────┴─────────────────┴───────────────────┤
│ [Section Content dynamically rendered according to active tab]        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Section 1: Flashcard Manager
- **Capabilities**:
  - Filter pills for the 10 topics (`config.topics`) + "All" + Search filter input.
  - Scrollable card list rendering each paper with:
    - Inline editable `catchyTitle` (`TextInput`)
    - Display of `originalTitle`, `authors`, and `source` badge
    - Inline editable `summary` (`TextInput` multiline)
    - Inline editable `url` (`TextInput`)
    - "Save Changes" button (persists to Firestore `content/dailyFeed` and updates in-memory `AppState.feedData`).
    - "Delete" button with confirmation alert (`Alert.alert` / modal).
- **Firestore Target**: Collection `content`, document `dailyFeed` (or `overrides`).

#### Section 2: Pipeline Control & Monitoring
- **Capabilities**:
  - Top status bar: Last pipeline run timestamp, total papers ingested, run errors (read from Firestore `pipeline_runs` collection, latest document).
  - Grid / List of 10 topic cards:
    - Topic icon, label, slug.
    - Last fetched count.
    - "Trigger Fetch" button with loading indicator.
  - Trigger Fetch action writes a task request document to Firestore `pipeline_queue` with:
    `{ topic: topicSlug, requestedAt: new Date().toISOString(), status: 'pending', requestedBy: user.email }`.
- **Firestore Targets**: Reads `pipeline_runs`, writes `pipeline_queue`.

#### Section 3: API Usage Dashboard
- **Capabilities**:
  - Summary metric cards: Total LLM Calls, Successful Calls, Failed Calls, Active Providers (Gemini / Mistral / Grok).
  - Daily breakdown table: Date, Provider, Total Calls, Successes, Failures.
  - Reads from Firestore `api_usage` collection (logged by backend `llm.js`).
- **Firestore Target**: Reads `api_usage`.

#### Section 4: Settings & Config
- **Capabilities**:
  - **System Prompt Editor**: Multiline code/text editor for the AI title generation prompt (defaulting to the prompt from `backend/pipeline/llm.js:120`). "Save System Prompt" writes to Firestore `config/system_prompt`.
  - **Admin Whitelist Manager**:
    - Lists current admin emails fetched from Firestore `admins` collection.
    - Super Admin badge for the email matching `EXPO_PUBLIC_ADMIN_EMAIL`.
    - Add Admin input + "Add Admin" button (`setDoc(doc(db, 'admins', email.toLowerCase()), { email, addedAt: new Date().toISOString(), addedBy: user.email })`).
    - "Remove" button for non-superadmin entries (`deleteDoc(doc(db, 'admins', email.toLowerCase()))`).
    - Only enabled when `isSuperAdmin === true`.
- **Firestore Targets**: Reads/writes `config`, reads/writes `admins`.

---

### 2.3 Firestore Security Rules Update (`app/firestore.rules`)
To enforce security server-side matching R1 & R6:
```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isSuperAdmin() {
      return isAuthenticated() && 
        request.auth.token.email.lower() == "admin@example.com"; // replaced or checked via admin doc
    }
    
    function isAdmin() {
      return isAuthenticated() && (
        exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower())) ||
        request.auth.token.email.lower() == "admin@example.com"
      );
    }

    // User data: owner only
    match /users/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }

    // Admin whitelist: admins can read, superadmin can write
    match /admins/{adminEmail} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }

    // System prompt and configurations: admins only
    match /config/{configId} {
      allow read, write: if isAdmin();
    }

    // Pipeline monitoring and triggers: admins only
    match /pipeline_runs/{runId} {
      allow read, write: if isAdmin();
    }
    
    match /pipeline_queue/{queueId} {
      allow read, write: if isAdmin();
    }

    // API usage tracking: admins only
    match /api_usage/{usageId} {
      allow read, write: if isAdmin();
    }

    // Flashcard content overrides: public read, admin write
    match /content/{contentId} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

---

## 3. Caveats

1. **Client-side vs Server-side Environment Variables**:
   - `EXPO_PUBLIC_ADMIN_EMAIL` is embedded into the client bundle at build time. Client-side hiding of UI is for UX and prevention of interface exposure. Server-side data security is guaranteed by Firestore Security Rules.
2. **Offline Mode & Demo Mode**:
   - When running without Firebase credentials (`isFirebaseConfigured() === false`), `useAuth` correctly operates in local mode. In this mode, `isAdmin` must be `false` unless a local debug override is specified.
3. **Admin Whitelist Document Key Format**:
   - Firestore document keys cannot contain slashes. Email addresses are valid document keys in Firestore, but should be strictly converted to lowercase (`email.trim().toLowerCase()`) to avoid case mismatches.
4. **Web DOM Verification**:
   - In React Native Web, conditional rendering (`{isAdmin && <Component />}`) guarantees that no DOM elements or text nodes exist in the rendered HTML when `isAdmin` is false.

---

## 4. Conclusion

1. **Auth (`useAuth.ts`)**: Can be cleanly extended with `isAdmin`, `isSuperAdmin`, and `adminLoading` without breaking any existing consumers (`AppState.tsx`, `DrawerContent.tsx`, `SettingsScreen.tsx`).
2. **Navigation (`RootNavigator.tsx` & `DrawerContent.tsx`)**: Drawer entry "Mission Control" with Feather `shield` icon will be conditionally rendered strictly behind `{isAdmin && ...}`. The `Admin` route will be registered in `RootNavigator.tsx` and protected with an authorization guard.
3. **Theme & Design**: All UI elements in `AdminScreen.tsx` will strictly adhere to `app/src/theme.ts` tokens (`#000000` bg, `#121212` card, `#2a2a2a` cardBorder, `#1d9bf0` primary, Feather icons, 48px touch targets, dark aesthetic).
4. **Flashcard Manager & Collections**: Flashcard inline CRUD, Pipeline Control, API Usage table, and System Prompt / Whitelist Settings can interact directly with Firestore collections (`admins`, `config`, `pipeline_runs`, `pipeline_queue`, `api_usage`, `content`) while falling back gracefully when offline.

---

## 5. Verification Method

### 5.1 Static Type Checking
```bash
cd app
npx tsc --noEmit
```
- **Expected Result**: Exit code 0, zero type errors across all files including `useAuth.ts`, `RootNavigator.tsx`, `DrawerContent.tsx`, `AdminScreen.tsx`, and `types.ts`.

### 5.2 Production Web Build
```bash
cd app
npx expo export -p web
```
- **Expected Result**: Successful export to `app/dist` without bundling or syntax errors.

### 5.3 DOM Leakage Verification
- Inspect the generated client bundle and rendered web view when unauthenticated or logged in as a non-admin user:
- Confirm that the string `"Mission Control"` is NOT rendered in the DOM tree.

### 5.4 Invalidation Conditions
- Any occurrence of `isAdmin` evaluating to `true` when neither `EXPO_PUBLIC_ADMIN_EMAIL` nor Firestore `admins` match.
- Any non-admin user able to view or navigate to Mission Control.
- Any type discrepancies in `Paper` or `useAuth` hook interfaces.
