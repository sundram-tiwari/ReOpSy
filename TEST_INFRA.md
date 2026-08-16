# ReOpSy Version 2 — Test Infrastructure Documentation

## 1. Overview & Architectural Philosophy

The ReOpSy Version 2 E2E Test Suite provides automated, zero-dependency, end-to-end verification of all application requirements (R1–R5), pipeline data flows, mobile UX constraints, and security protocols.

Built on top of Node.js's native test runner (`node:test` + `node:assert/strict`) and TypeScript compilation checks, the suite runs completely self-contained without requiring external cloud accounts, live API quotas, or emulator setups during test execution.

---

## 2. 4-Tier Test Architecture

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
│  (R1 - R5)      │   │  Edge Cases     │                           │  Cross-Feature  │   │  User Journeys  │
│ tests/tier1_... │   │ tests/tier2_... │                           │ tests/tier3_... │   │ tests/tier4_... │
└─────────────────┘   └─────────────────┘                           └─────────────────┘   └─────────────────┘
```

### Tier 1: Feature Coverage (>=5 Tests per Feature for R1–R5)
- **Feature R1 (Predefined Categories & Pipeline)**:
  - 10 default topics configuration & labels (`topics.js` & `config.ts`).
  - Daily feed non-empty verification (0 dummy cards allowed in `dailyFeed.json`).
  - Semantic Scholar TLDR fetcher & 600ms rate-limit adherence.
  - Multi-LLM fallback chaining (`Gemini -> Mistral -> Grok -> Original Title`).
  - SQLite schema multi-topic retention (`PRIMARY KEY (id, topic)`).
  - Dry-run CLI execution (`--dry` mode processing 10 topics without mutation).
- **Feature R2 (Google Authentication & Cloud Persistence)**:
  - Firebase initialization with `isFirebaseConfigured()` conditional check.
  - User login & profile metadata synchronization.
  - Remote Firestore hydration on session launch (`getDoc(doc(db, 'users', uid))`).
  - AsyncStorage zero-downtime offline fallback.
  - Logout & cache reset lifecycle without session corruption.
- **Feature R3 (Mobile-First Flashcard Experience & UI)**:
  - Snap-scrolling container measurement, `snapToInterval`, `snapToAlignment="start"`, and `decelerationRate="fast"`.
  - Touch target accessibility compliance (`>= 48x48px` or `hitSlop` on all buttons, tabs, chips).
  - Feather vector icon standardization & zero emoji / raw unicode glyphs.
  - Seamless footer action bar integration (`colors.bg` background matching).
  - Typography parity (16px font size for both Title and Summary, zero text truncation).
- **Feature R4 (User API Integration & Personalized Custom Topic)**:
  - Settings screen provider options (Gemini, Mistral, Grok, Custom).
  - Live HTTP API connection validator (`apiValidator.ts`).
  - Custom topic live fetcher (arXiv search + client LLM synthesis).
  - Dynamic `"custom"` tab in `TopicTabs` isolated from default categories.
  - Graceful fallback to raw excerpt on user LLM failure.
- **Feature R5 (Scalable Content Architecture & Security)**:
  - 4-Level content taxonomy model segregation (Default, User Subscriptions, BYO-Key, Live Custom).
  - Firestore owner-only security rules verification (`request.auth.uid == userId`).
  - Masked API key display with bullet previews (`••••••••<last4>`).
  - Error log sanitization filtering query parameters and authorization headers.
  - Secure BYO-Key removal and local/cloud scrubbing.

### Tier 2: Boundary & Corner Cases
- Empty author arrays, null venues, null years, null PDF links.
- Empty and whitespace-only search queries.
- Zero followed topics recovery.
- Extreme string lengths (> 500-char titles, > 3000-char summaries, 50 authors, 1000-char API keys).
- HTTP 429 rate limiting, HTTP 503 service unavailable, offline network drops.
- Malformed arXiv XML feeds and corrupted JSON in `AsyncStorage`.
- SQL injection safety in SQLite queries via prepared statements.
- XSS and HTML tag sanitization in user research queries.
- Streak state boundaries (0 days, same-day duplicate reads, freeze consumption, 3-freeze cap).

### Tier 3: Cross-Feature Combinations
- Combination 3.1: Auth State Change + Offline Mode + Custom Topic + Streak Advancement.
- Combination 3.2: Multi-LLM Provider Switching + Validation Error Recovery + Masked Storage.
- Combination 3.3: Custom Topic Live Fetch + Bookmarking + Multi-Level Segregation.
- Combination 3.4: Topic Unfollowing + Active Tab Auto-Fallback + Like Interaction.
- Combination 3.5: Cache Clear Lifecycle while Authenticated.

### Tier 4: Real-World Workload Scenarios
- Scenario 4.1: First-time user onboarding, multi-topic browsing & streak initiation.
- Scenario 4.2: Power researcher journey (Sign in -> BYO-Key -> Live arXiv Search -> Synthesis -> Bookmark).
- Scenario 4.3: Offline transit journey & automatic reconnection synchronization.
- Scenario 4.4: Multi-device profile & reading list synchronization.

---

## 3. Test Harness Helpers

The test suite includes dedicated test harnesses under `tests/helpers/`:

1. **`mockStorage.js`**:
   - `MockAsyncStorage`: In-memory key-value store simulating `@react-native-async-storage/async-storage`.
   - `MockFirestore`: In-memory document database simulating Firebase Firestore `setDoc`, `getDoc`, and collections.
2. **`mockLlm.js`**:
   - `MockLlmHarness`: Intercepts and simulates HTTP requests to Google Gemini, Mistral, Grok, Semantic Scholar, and arXiv APIs with configurable status codes, network drops, and latency.
3. **`astAuditor.js`**:
   - `AstAuditor`: Static source code and layout analyzer auditing touch targets, Feather icons, emoji absence, typography sizes, snap-scrolling props, and masked inputs.
4. **`dataValidator.js`**:
   - `validatePaper`: Verifies paper object compliance.
   - `validateDailyFeed`: Scans `dailyFeed.json` for 10 topic coverage and dummy card absence.

---

## 4. How to Run the Tests

### Run Master E2E Suite (All 4 Tiers)
```bash
node tests/run_all_e2e.js
```

### Run Individual Tiers
```bash
# Tier 1: Feature Coverage (R1 - R5)
node --test tests/tier1_features.test.js

# Tier 2: Boundary & Corner Cases
node --test tests/tier2_boundaries.test.js

# Tier 3: Cross-Feature Combinations
node --test tests/tier3_combinatorial.test.js

# Tier 4: Real-World Workloads
node --test tests/tier4_workloads.test.js
```

### Run Full Project Build & Logic Tests
```bash
# Backend Ingest Tests
cd backend && npm test

# Frontend TypeScript Compilation & Logic Tests
cd app && npm test

# Frontend Typecheck
cd app && npx tsc --noEmit

# Frontend Web Production Export
cd app && npx expo export -p web
```
