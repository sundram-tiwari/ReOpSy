# Project: ReOpSy Version 2

## Architecture
ReOpSy Version 2 is a personalized, mobile-first flashcard platform for academic research papers. It comprises:
1. **Backend Pipeline (`backend/`)**:
   - Automated ingestion from OpenAlex and arXiv.
   - Semantic Scholar API client for free extractive `tldr` extraction.
   - Multi-LLM fallback engine (`Gemini -> Mistral -> Grok -> original title`) generating catchy titles and mobile-friendly flashcard summaries.
   - SQLite persistent storage (`backend/db/data/database.sqlite`) retaining multi-topic research papers.
   - Dry-run verification script (`node pipeline/fetchAndSummarize.js --dry`).
2. **Frontend App (`app/`)**:
   - React Native & Expo SDK 57 cross-platform client (iOS, Android, Web).
   - Snap-scrolling flashcard feed with 48px touch targets, Feather vector icons, and seamless action bar footer.
   - Firebase Auth Google sign-in and Firestore synchronization with zero-downtime offline `AsyncStorage` fallback.
   - Settings UI for custom LLM API keys (Gemini, Mistral, Grok, Custom) with masked input and real connection validation.
   - Live custom research topic search (arXiv + client LLM synthesis) isolated in a dedicated `"custom"` feed tab.
3. **Multi-Level Content Architecture**:
   - Level 1: Predefined 10 default topics shipped via `dailyFeed.json` & SQLite cache.
   - Level 2: User-customized followed topics and bookmarks in Firestore / AsyncStorage.
   - Level 3: User BYO-API credentials stored securely in private user document.
   - Level 4: Highly specific live research queries synthesized on-demand without impacting default categories.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Predefined 10 Topics Feed | All 10 topics (`ml`, `dl`, `nlp`, `cv`, `ai-health`, `llm`, `robotics`, `cybersecurity`, `data-science`, `bio`) populated with real papers | M1 | ORIGINAL_REQUEST R1 |
| 2 | Ingest Filter & Summary Fix | Fix `fetchAndSummarize.js` filter so non-CC-BY papers with abstracts/summaries are not dropped | M1 | Survey Explorer 1 |
| 3 | Semantic Scholar TLDR | Fetch paper TLDR via Semantic Scholar API with 600ms rate limiting and fallback to extractive summary | M1 | ORIGINAL_REQUEST R1 |
| 4 | Multi-LLM Fallback Chaining | Sequential title generation: `Gemini -> Mistral -> Grok -> original title` | M1 | ORIGINAL_REQUEST R1 |
| 5 | SQLite Schema & Multi-Topic Key | Table `papers` with `PRIMARY KEY (id, topic)` and updated 10 topics seed schema | M1 | Survey Explorer 1 / R5 |
| 6 | Dry Run CLI Processing | `node pipeline/fetchAndSummarize.js --dry` processes all 10 topics with 0 fatal errors | M1 | ORIGINAL_REQUEST Criteria |
| 7 | Google Auth (Firebase Auth) | Google login support via Firebase Auth with user profile management | M2 | ORIGINAL_REQUEST R2 |
| 8 | Firestore Remote Hydration | On Google login, hydrate profile, followed topics, bookmarks, likes, streak, and API config via `getDoc` | M2 | Survey Explorer 3 / R2 |
| 9 | AsyncStorage Offline Fallback | Graceful local fallback when logged out or offline with zero crash risk | M2 | ORIGINAL_REQUEST R2 |
| 10 | Mobile Snap-Scrolling | Precise viewport height measurement (`onLayout`), `snapToInterval`, `snapToAlignment="start"`, and `decelerationRate="fast"` | M3 | ORIGINAL_REQUEST R3 |
| 11 | Touch Target Accessibility | Ensure all interactive buttons, tabs, pills, and links have minimum bounding box `>= 48x48px` | M3 | ORIGINAL_REQUEST R3 |
| 12 | Feather Vector Icon Standardization | Replace all emoji literals and Unicode glyphs with `@expo/vector-icons` Feather components | M3 | ORIGINAL_REQUEST R3 |
| 13 | Seamless Footer Action Area | Footer action bar seamlessly integrated into card background with safe-area insets | M3 | ORIGINAL_REQUEST R3 |
| 14 | Typography Parity | Identical 16px font size for title and summary, no summary truncation | M3 | ORIGINAL_REQUEST R3 |
| 15 | Settings Screen for API Keys | UI to configure Gemini, Mistral, Grok, or Custom API key with masked input and eye toggle | M4 | ORIGINAL_REQUEST R4 |
| 16 | Live API Validator | Real HTTP health-check ping against Gemini, Mistral, Grok, or Custom endpoint (`apiValidator.ts`) | M4 | Survey Explorer 3 / R4 |
| 17 | Custom Topic Live Fetcher | Search arXiv API for user custom query and synthesize flashcards via user LLM key (`customTopicFetcher.ts`) | M4 | ORIGINAL_REQUEST R4 |
| 18 | Dynamic Custom Topic Tab | Dedicated `"custom"` pill in `TopicTabs.tsx` rendering custom paper deck without altering default categories | M4 | Survey Explorer 3 / R4 |
| 19 | Secure Key Storage & Sanitization | Owner-only Firestore rules (`users/{userId}`), error log sanitization, no client log leaks | M4 | ORIGINAL_REQUEST R5 |
| 20 | E2E Automated Test Suite | Comprehensive Tiers 1-4 tests (Category Partition, Boundary, Combinatorial, Real-World Workload) | E2E Track | ORIGINAL_REQUEST Criteria |
| 21 | Programmatic Acceptance Verification | Run and pass `npx tsc --noEmit`, `npx expo export -p web`, and `fetchAndSummarize.js --dry` | M5 | ORIGINAL_REQUEST Criteria |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite | Test harness, unit tests, integration tests across Tiers 1-4 | none | **DONE** |
| M1 | Backend Pipeline & Content | Predefined 10 topics, filter fix, Semantic Scholar TLDR, multi-LLM fallback, SQLite multi-topic schema | none | **DONE** |
| M2 | Auth & Cloud Persistence | Firebase Google Auth, Firestore hydration on login, AsyncStorage fallback | none | **DONE** |
| M3 | Mobile-First Flashcard UX | Snap-scrolling, >=48px touch targets, Feather icons, seamless footer, typography parity | none | **DONE** |
| M4 | Settings & Custom Live Topic | User API keys UI, masked input, live API validator, custom topic live fetcher, dynamic custom tab, security | M2, M3 | **DONE** |
| M5 | Final Programmatic & E2E Gate | Pass 100% E2E tests, `npx tsc`, `expo export -p web`, `fetchAndSummarize.js --dry`, Forensic Audit | M1, M2, M3, M4, E2E | **DONE** |

---

## Interface Contracts

### 1. Backend Pipeline (`backend/pipeline/fetchAndSummarize.js`)
- `fetchAndSummarize(options: { dryRun?: boolean, outputFeedPath?: string }): Promise<{ success: boolean, topicsProcessed: number, totalPapers: number }>`
- Multi-LLM fallback: `generateCatchyTitle(originalTitle: string, summary: string, apiKeys: { gemini?: string, mistral?: string, xai?: string }): Promise<{ catchyTitle: string, provider: string }>`
- Semantic Scholar TLDR: `fetchTldr(paperTitle: string): Promise<string | null>`

### 2. State & Storage Contract (`app/src/state/AppState.tsx`)
- `AppState`: `{ followedTopics: string[], activeTopic: string, savedPapers: Paper[], likedPapers: string[], streak: StreakState, userApiConfig: UserApiConfig | null, customFeedData: Paper[], isLoaded: boolean }`
- Sync Protocol:
  - Writes to `AsyncStorage.setItem('reopsy_v2_state', ...)` on any mutation.
  - If authenticated: `setDoc(doc(db, 'users', user.uid), state, { merge: true })`.
  - On auth change (`user` becomes non-null): calls `getDoc(doc(db, 'users', user.uid))` to merge cloud state into local state.

### 3. API Validator Contract (`app/src/services/apiValidator.ts`)
- `validateApiConnection(config: { provider: 'Gemini' | 'Mistral' | 'Grok' | 'Custom', apiKey: string, endpoint?: string }): Promise<{ success: boolean, message: string }>`

### 4. Custom Topic Fetcher Contract (`app/src/services/customTopicFetcher.ts`)
- `fetchCustomTopicPapers(topicQuery: string, apiConfig: UserApiConfig): Promise<Paper[]>`

---

## Code Layout
- `backend/pipeline/fetchAndSummarize.js` - Main pipeline orchestrator
- `backend/pipeline/semanticScholar.js` - Semantic Scholar API client
- `backend/pipeline/llm.js` - Multi-LLM fallback client
- `backend/db/db.js` - SQLite database client and schema
- `backend/schema.sql` - Seed database definition
- `app/src/App.tsx` - App root
- `app/src/navigation/RootNavigator.tsx` - App navigator
- `app/src/screens/FeedScreen.tsx` - Flashcard feed screen
- `app/src/screens/SettingsScreen.tsx` - Settings and API key screen
- `app/src/screens/PersonalizationScreen.tsx` - Topic follow modal
- `app/src/screens/SavedScreen.tsx` - Bookmarks screen
- `app/src/components/PaperCard.tsx` - Single flashcard component
- `app/src/components/ActionBar.tsx` - Card action footer
- `app/src/components/TopicTabs.tsx` - Topic filter pill tabs
- `app/src/components/DrawerContent.tsx` - Drawer menu
- `app/src/state/AppState.tsx` - Global React context and storage synchronizer
- `app/src/services/firebase.ts` - Firebase initialization
- `app/src/services/apiValidator.ts` - Live LLM API validator
- `app/src/services/customTopicFetcher.ts` - Client-side arXiv search and custom LLM synthesis
- `app/src/config.ts` - Default topics configuration
- `app/src/types.ts` - TypeScript interfaces
