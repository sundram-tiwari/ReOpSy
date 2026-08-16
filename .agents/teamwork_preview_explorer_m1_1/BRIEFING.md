# BRIEFING — 2026-08-16T11:48:45Z

## Mission
Investigate and design the exact code changes for Milestone 1 (Auth, Permissions & Security: useAuth.ts, firestore.rules, adminService.ts).

## 🔒 My Identity
- Archetype: explorer
- Roles: [explorer, synthesis]
- Working directory: d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_m1_1
- Original parent: d59e47a6-65c1-40b7-93f6-3ce57c9ea5dd
- Milestone: Milestone 1 (Auth, Permissions & Security)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in app source code.
- Provide exact proposed code changes and diffs in handoff.md.
- Ensure case-insensitivity, offline/unconfigured safety, error handling, strict firestore security rules.

## Current Parent
- Conversation ID: d59e47a6-65c1-40b7-93f6-3ce57c9ea5dd
- Updated: 2026-08-16T11:48:45Z

## Investigation State
- **Explored paths**: `app/src/hooks/useAuth.ts`, `app/firestore.rules`, `firestore.rules`, `app/src/services/firebase.ts`, `tests/e2e/tier1_features/f1_admin_auth.test.js`, `tests/e2e/tier1_features/f2_security_rules.test.js`, `tests/e2e/harness/firestoreMock.js`, `tests/e2e/harness/authEmulator.js`
- **Key findings**:
  1. `useAuth.ts` needs `isAdmin`, `isSuperAdmin`, `adminLoading` with case-insensitive check of `EXPO_PUBLIC_ADMIN_EMAIL` and `admins/{email}` doc.
  2. `firestore.rules` needs helper functions `isAuthenticated()`, `isOwner(userId)`, `isAdmin()` and rules for `admins`, `config`, `pipeline_runs`, `pipeline_queue`, `api_usage`, `content`, and `users/{userId}`.
  3. `adminService.ts` encapsulates all Firestore operations for admin check, whitelist queries, pipeline triggers, prompt configs, and feed persistence.
- **Unexplored areas**: None for Milestone 1.

## Key Decisions Made
- Designed drop-in replacement implementations for `useAuth.ts` and `firestore.rules` and new `adminService.ts` in `handoff.md`.

## Artifact Index
- d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_m1_1/DISPATCH.md — Dispatch log
- d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_m1_1/progress.md — Liveness and progress tracker
- d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_m1_1/handoff.md — Final investigation and design report
