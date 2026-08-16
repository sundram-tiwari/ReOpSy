# Orchestration Plan — ReOpSy Version 2

## Objective
Deliver a production-ready, verified Version 2 of ReOpSy covering:
- R1: Predefined categories content & multi-LLM fallback pipeline (Gemini -> Mistral -> Grok -> original title) + Semantic Scholar TLDR integration.
- R2: Firebase Auth Google login & persistent user settings to Firestore (with AsyncStorage fallback).
- R3: Mobile-first flashcard UX redesign (snap-scrolling, touch targets >= 48px, Feather vector icons, seamless footer background, identical font size for title and summary).
- R4: Settings screen for user API keys & custom research topic live fetch.
- R5: Scalable content architecture & secure handling of user API keys in Firestore.
- Verification: All 3 programmatic checks passing cleanly + comprehensive E2E tests.

## Phase 0: Survey & Exploration (Current)
- Dispatch 3 Explorers in parallel:
  1. `explorer_backend`: Inspect backend structure, `pipeline/fetchAndSummarize.js`, API clients (Semantic Scholar, Gemini, Mistral, Grok), databases, and topic feeds.
  2. `explorer_frontend`: Inspect `app/`, Expo configuration, navigation, screens (Flashcard feed, Settings), components, icons, styles, and web export compatibility.
  3. `explorer_auth_security`: Inspect Firebase configuration, Auth setup, Firestore security & data schema, AsyncStorage fallback, API key handling.

## Phase 1: Test Infrastructure & Specification
- Synthesize explorer findings into `PROJECT.md` (Feature Inventory, Milestones, Architecture, Interfaces).
- Dispatch `teamwork_preview_test_writer` to construct automated E2E & integration test scripts (Tiers 1-4).

## Phase 2: Implementation Milestones (Parallel / Staged Workers)
- **Milestone 1 (Backend & Content - R1, R5)**:
  - Multi-LLM fallback (Gemini -> Mistral -> Grok -> original title).
  - Semantic Scholar API TLDR integration.
  - Predefined 10 topics content population and dry-run verification.
- **Milestone 2 (Auth & Settings State - R2, R5)**:
  - Firebase Auth Google sign-in integration.
  - Firestore user profile and preferences persistence.
  - Offline/Logged-out AsyncStorage graceful fallback.
- **Milestone 3 (Mobile-First Flashcard UX - R3)**:
  - Snap-scrolling (pagingEnabled/snapToInterval).
  - Touch targets >= 48px.
  - Feather vector icons replacing all emojis.
  - Seamless footer background integrating action area.
  - Identical font size for title and summary.
- **Milestone 4 (Settings & Live Fetch - R4, R5)**:
  - Settings UI for user API keys (Gemini, Mistral, Grok, Custom) with secure masked input.
  - Custom research topic live fetch without disrupting default categories.
  - Multi-level content architecture & secure Firestore storage.

## Phase 3: Review, Verification & Forensic Audit
- Dispatch Reviewers, Challengers, and Forensic Auditor for each milestone.
- Run all 3 programmatic verification checks:
  1. `cd app && npx tsc --noEmit`
  2. `cd app && npx expo export -p web`
  3. `cd backend && node pipeline/fetchAndSummarize.js --dry`
- Functional verification of all acceptance criteria.

## Phase 4: Final Acceptance & Completion Report
- Final pass validation.
- Message caller with completion report.
