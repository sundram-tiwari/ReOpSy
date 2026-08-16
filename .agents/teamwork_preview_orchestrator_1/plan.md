# Plan: Mission Control Admin Panel Implementation & Verification

## Objective
Deliver a secure, dark-themed, end-to-end integrated "Mission Control" admin panel for ReOpSy with complete functionality across all 6 requirements (R1-R6) and comprehensive automated/functional verification.

## Orchestration Plan
1. **Phase 0: Architecture & Codebase Survey**
   - Dispatch Explorer 1: Frontend architecture, navigation, auth, theme, drawer, existing components.
   - Dispatch Explorer 2: Backend architecture, pipeline, llm.js, Firestore rules, data structures.
   - Dispatch Explorer 3: Feature inventory, interface contracts, testing harness design.
2. **Phase 1: Architecture & Global Scope Document**
   - Synthesize Survey reports into `PROJECT.md` and `TEST_INFRA.md`.
   - Complete Feature Inventory & Interface Contracts mapping.
3. **Phase 2: Dual Track Execution**
   - **Track A (E2E Testing Track)**: Build standalone test harness covering Tiers 1-4 for R1-R6. Publish `TEST_READY.md`.
   - **Track B (Implementation Track)**:
     - Sub-orchestrator M1: Auth & Security Rules (useAuth isAdmin, EXPO_PUBLIC_ADMIN_EMAIL fallback + Firestore admins collection, firestore.rules update).
     - Sub-orchestrator M2: Admin Panel Shell & Flashcard Manager (AdminScreen tabbed layout, Feather shield icon conditional drawer, Flashcard inline CRUD, Firestore content persistence).
     - Sub-orchestrator M3: Pipeline Control & API Usage Dashboard (fetchAndSummarize Firestore logging, pipeline_queue triggers, llm.js usage logging, UI dashboards).
     - Sub-orchestrator M4: System Prompt Editor & Whitelist Management (config document prompt management in llm.js and UI, admin whitelist CRUD).
     - Final Milestone M5: 100% E2E Pass + Adversarial Tier 5 hardening.
4. **Phase 3: Final Verification & Reporting**
   - Verify `tsc --noEmit` and `expo export -p web`.
   - Verify non-admin DOM isolation (zero admin traces for regular users).
   - Write comprehensive handoff and report back to parent.
