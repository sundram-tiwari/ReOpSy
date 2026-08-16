## 2026-08-16T06:43:18Z

You are Worker 2 implementing Milestone 2 (Auth & Cloud Persistence - R2 & R5) for ReOpSy Version 2.

Your working directory: d:/Intern/ReOpSy/.agents/teamwork_preview_worker_m2_1
Original request path: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md
Project specification path: d:/Intern/ReOpSy/.agents/PROJECT.md

File Write Ownership (Exclusively owned by you):
- `app/src/services/firebase.ts`
- `app/src/hooks/useAuth.ts`
- `app/src/state/AppState.tsx`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Instructions:
1. Read `d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md` and `d:/Intern/ReOpSy/.agents/PROJECT.md`.
2. Implement all Milestone 2 requirements:
   - Enhance `app/src/state/AppState.tsx` so that when `user` transitions to authenticated, it calls `getDoc(doc(db, 'users', user.uid))` to hydrate and merge cloud state (followedTopics, savedPapers, likedPapers, streak, userApiConfig) into local state without losing offline modifications.
   - Maintain seamless local-first persistence: always write to `AsyncStorage.setItem('reopsy_v2_state', ...)` and sync to Firestore `setDoc(doc(db, 'users', user.uid), ...)` when authenticated.
   - Ensure complete graceful fallback when logged out, offline, or when Firebase credentials are not yet configured (zero crashes).
   - In `app/src/hooks/useAuth.ts`, handle Google Sign-In with popup/redirect and graceful feedback when unconfigured.
3. Verification:
   - Run `npx tsc --noEmit` in `app/` and ensure 0 type errors.
   - Verify state synchronization logic with unit/integration checks.
4. Document all changes and verification command outputs in `d:/Intern/ReOpSy/.agents/teamwork_preview_worker_m2_1/handoff.md` and send a message when done.
