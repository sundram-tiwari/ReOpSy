# E2E Test Infra: ReOpSy "Mission Control" Admin Panel

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests verify user requirements R1-R6, security constraints, and UI/backend contracts without coupling to private implementation details.
- **Methodology**: 4-Tier Test Pyramid + Tier 5 Adversarial Coverage Hardening.

## Feature Inventory & Test Allocation
| # | Feature | Requirement | Tier 1 (Coverage ≥5) | Tier 2 (Boundary ≥5) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
|---|---------|-------------|:-------------------:|:-------------------:|:---------------------:|:-------------------:|
| F1 | Admin Auth & Dynamic Whitelist | R1 | 5 | 5 | ✓ | ✓ |
| F2 | Firestore Security Rules | R1, R6 | 5 | 5 | ✓ | ✓ |
| F3 | Zero-DOM Leakage Navigation | R1, R2 | 5 | 5 | ✓ | ✓ |
| F4 | Admin Panel UI & Dark Theme | R2 | 5 | 5 | ✓ | ✓ |
| F5 | Flashcard Manager Inline CRUD | R3 | 5 | 5 | ✓ | ✓ |
| F6 | Flashcard Persistence | R3 | 5 | 5 | ✓ | ✓ |
| F7 | Pipeline Run Logging | R4 | 5 | 5 | ✓ | ✓ |
| F8 | Pipeline Control UI & Queue | R4 | 5 | 5 | ✓ | ✓ |
| F9 | LLM API Usage Logging | R5 | 5 | 5 | ✓ | ✓ |
| F10 | API Usage Dashboard Aggregation | R5 | 5 | 5 | ✓ | ✓ |
| F11 | System Prompt Editor & Fallback | R6 | 5 | 5 | ✓ | ✓ |
| F12 | Admin Whitelist UI Manager | R6 | 5 | 5 | ✓ | ✓ |
| **Total** | | | **60** | **60** | **12** | **6** |

## Test Architecture & Directory Layout
- `tests/e2e/harness/`: Reusable mock environment, Firestore state mock, auth session emulator.
- `tests/e2e/tier1_features/`: Unit & functional checks for F1-F12 in isolation.
- `tests/e2e/tier2_boundary/`: Edge cases (invalid emails, offline fallbacks, corrupted JSON, missing env vars, empty queues, case sensitivity).
- `tests/e2e/tier3_integration/`: Pairwise workflows (Admin login -> prompt edit -> pipeline fetch -> usage log -> dashboard display).
- `tests/e2e/tier4_scenarios/`: End-to-end user journeys simulating admin operations and regular user isolation.
- `tests/e2e/runner.js`: Automated runner that executes all tiers and outputs structured pass/fail results.

## Real-World Application Scenarios (Tier 4)
1. **Scenario 1: Super Admin Complete Onboarding & Whitelisting**:
   - Super admin logs in via `EXPO_PUBLIC_ADMIN_EMAIL`.
   - Navigates to Mission Control -> Settings -> Whitelist.
   - Adds a secondary admin `colleague@reopsy.com`.
   - Secondary admin logs in, accesses Mission Control, verifies admin privileges.
2. **Scenario 2: Non-Admin Complete Isolation**:
   - Regular user logs in with non-whitelisted email.
   - Verifies drawer has NO "Mission Control" item, DOM contains 0 occurrences of "Mission Control", direct navigation guard redirects or denies access.
3. **Scenario 3: Editorial Flashcard Curation Lifecycle**:
   - Admin edits flashy title and summary of an NLP paper in Flashcard Manager.
   - Deletes an obsolete paper with confirmation.
   - Changes persist to Firestore `content` and reload correctly.
4. **Scenario 4: Pipeline Trigger & Real-Time Monitoring**:
   - Admin triggers fetch for `llm` topic.
   - Task enqueued in `pipeline_queue`.
   - Pipeline processes queue, generates paper summaries, logs to `pipeline_runs`.
   - Admin views updated run counts and timestamp in Pipeline Control.
5. **Scenario 5: LLM Failure Fallback & API Usage Reporting**:
   - Simulated Gemini failure triggers fallback to Mistral in `llm.js`.
   - Both calls logged to `api_usage`.
   - API Usage Dashboard displays aggregated total calls, 1 failure for Gemini, 1 success for Mistral.
6. **Scenario 6: Dynamic System Prompt Modification**:
   - Admin customizes prompt in Settings to enforce concise 5-word titles.
   - Prompt saved to Firestore `config/system_prompt`.
   - `llm.js` picks up the custom prompt on next run.

## Coverage Thresholds
- Tier 1: ≥5 per feature (60 total)
- Tier 2: ≥5 per feature (60 total)
- Tier 3: ≥12 pairwise cross-feature tests
- Tier 4: ≥6 real-world application scenarios
- Acceptance: 100% test pass rate + `tsc --noEmit` exit 0 + `expo export -p web` exit 0.
