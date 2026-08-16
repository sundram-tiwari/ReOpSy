## 2026-08-16T06:43:18Z

You are the E2E Test Writer for ReOpSy Version 2.

Your working directory: d:/Intern/ReOpSy/.agents/teamwork_preview_test_writer_e2e_1
Original request path: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md
Project specification path: d:/Intern/ReOpSy/.agents/PROJECT.md

Instructions:
1. Read `d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md` and `d:/Intern/ReOpSy/.agents/PROJECT.md`.
2. Design and create the comprehensive E2E test suite according to the 4-tier methodology:
   - Tier 1: Feature Coverage (>=5 tests per feature for R1-R5).
   - Tier 2: Boundary & Corner Cases (empty data, network timeouts, invalid keys, long summaries, rate limits).
   - Tier 3: Cross-Feature Combinations (auth state changes + offline fallback + custom topic live fetch + streak update).
   - Tier 4: Real-World Workload Scenarios (end-to-end user journeys from first open -> browse default topics -> sign in -> set custom API key -> live fetch topic -> bookmark paper).
3. Create automated test runners/scripts under `tests/` or `app/` and `backend/` that test:
   - Pipeline data integrity (verifying all 10 topics have real papers and no dummy cards).
   - Semantic Scholar TLDR extraction and Multi-LLM fallback chaining.
   - Auth state transitions and Firestore/AsyncStorage persistence.
   - Touch target compliance (>=48px) and icon/emoji audit.
   - Settings validation and masked key security.
4. Document the test infrastructure in `TEST_INFRA.md` and publish `TEST_READY.md` when the test suite is ready.
5. Run the test suite and verify everything passes or document test execution results.
6. Write your handoff report to `d:/Intern/ReOpSy/.agents/teamwork_preview_test_writer_e2e_1/handoff.md` and send a message when done.
