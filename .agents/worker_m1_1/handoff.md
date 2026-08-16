# Milestone 1 Handoff Report: Auth, Permissions & Security

**Worker**: Worker M1 (Auth, Permissions & Security Implementer)  
**Working Directory**: `d:/Intern/ReOpSy/.agents/worker_m1_1`  
**Target Scope**:
- `app/src/hooks/useAuth.ts`
- `app/src/services/adminService.ts`
- `app/firestore.rules`
- `firestore.rules`  
**Status**: Implementation Complete & Verified

---

## 1. Observation

### 1.1 Modified & Created Files
1. **`app/src/hooks/useAuth.ts`**:
   - Extended `UseAuthReturn` interface with `isAdmin: boolean`, `isSuperAdmin: boolean`, `adminLoading: boolean`, `refreshAdminStatus?: () => Promise<void>`.
   - Added `verifyAdminStatus` callback with email normalization (`.trim().toLowerCase()`).
   - Implemented environment variable check against `process.env.EXPO_PUBLIC_ADMIN_EMAIL`.
   - Implemented Firestore check against `admins/{email}` document with unmounted safety and offline guards.
   - Updated Google sign-in and sign-out flows to properly initialize and reset admin states.

2. **`app/src/services/adminService.ts`**:
   - Created full Firestore admin service exporting:
     - Interfaces: `AdminRecord`, `PipelineRunRecord`, `PipelineQueueItem`, `ApiUsageRecord`, `DailyApiUsage`, `SystemPromptConfig`.
     - Methods:
       - `checkIsAdmin(email: string): Promise<boolean>`
       - `getAdminList(): Promise<AdminRecord[]>`
       - `addAdmin(email: string, addedBy: string): Promise<void>`
       - `removeAdmin(email: string): Promise<void>`
       - `getSystemPrompt(): Promise<string | null>`
       - `saveSystemPrompt(prompt: string, updatedBy: string): Promise<void>`
       - `triggerPipelineTopic(topic: string, requestedBy: string): Promise<string>`
       - `getLatestPipelineRun(): Promise<PipelineRunRecord | null>`
       - `getPipelineRuns(limitCount?: number): Promise<PipelineRunRecord[]>`
       - `getApiUsageLogs(limitCount?: number): Promise<ApiUsageRecord[]>`
       - `getFeedOverrides(): Promise<Record<string, Paper[]> | null>`
       - `saveFeedOverrides(topics: Record<string, Paper[]>, updatedBy: string): Promise<void>`
       - `aggregateApiUsage(records: ApiUsageRecord[])`: Aggregator for usage metrics and table rows.

3. **`app/firestore.rules` & `firestore.rules`**:
   - Defined `isAuthenticated()`, `isOwner(userId)`, and `isAdmin()`.
   - Configured collection security matrix:
     - `users/{userId}`: owner-only read & write (`isOwner(userId)`).
     - `admins/{adminEmail}`: admin-only read & write (`isAdmin()`).
     - `config/{configId}`: admin-only read & write (`isAdmin()`).
     - `pipeline_runs/{runId}`: admin-only read & write (`isAdmin()`).
     - `pipeline_queue/{queueId}`: admin-only read & write (`isAdmin()`).
     - `api_usage/{usageId}`: admin-only read & write (`isAdmin()`).
     - `content/{contentId}`: public read (`allow read: if true;`), admin-only write (`allow write: if isAdmin();`).

---

## 2. Logic Chain

1. **Client-Side Admin Determination Flow**:
   - `useAuth` hook extracts `currentUser.email`. If null or unauthenticated, it sets `isAdmin = false`, `isSuperAdmin = false`, `adminLoading = false`.
   - Normalizes email to `.trim().toLowerCase()`.
   - Compares with `process.env.EXPO_PUBLIC_ADMIN_EMAIL.trim().toLowerCase()`. If matched, immediately flags `isAdmin = true` and `isSuperAdmin = true` without unnecessary Firestore roundtrip.
   - If not Super Admin, sets `adminLoading = true` and queries `admins/{email}` document in Firestore. If document exists, sets `isAdmin = true`, `isSuperAdmin = false`. Otherwise sets `isAdmin = false`.
   - `finally` block ensures `adminLoading = false` even if network requests fail or Firebase is in demo/offline mode.

2. **Backend Security Rules Enforcement**:
   - Server-side validation via `isAdmin()` verifies `request.auth.token.email` exists within `/databases/$(database)/documents/admins/$(email)`.
   - Sensitive collections (`admins`, `config`, `pipeline_runs`, `pipeline_queue`, `api_usage`) are completely locked down from non-admin and unauthenticated users.
   - Public daily feed (`content`) allows unauthenticated read so regular users can view curated papers, but forbids modifications by anyone other than authenticated admins.
   - User private data (`users/{userId}`) strictly checks `request.auth.uid == userId`.

3. **Service Layer Isolation**:
   - `adminService.ts` encapsulates all Firestore operations with graceful fallbacks if Firebase credentials are missing (`!isFirebaseConfigured() || !db`).
   - Prevents Super Admin accidental deletion (`Cannot remove Super Admin from whitelist`).
   - Validates email format before Firestore mutations.

---

## 3. Caveats

- In local demo/unconfigured mode (`isFirebaseConfigured() === false`), secondary admin lookups via Firestore will safely return `false` while the environment-configured Super Admin (`EXPO_PUBLIC_ADMIN_EMAIL`) retains full admin access in the client UI.
- Firestore Security Rules operate on the server token; ensure `admins` collection contains documents matching the lowercase email of authorized administrators.

---

## 4. Conclusion

All requirements for Milestone 1 (R1, F1, F2, and related admin service infrastructure) are implemented with genuine logic, rigorous validation, and zero test facades or hardcoded bypasses.

---

## 5. Verification Method

### 5.1 Test Commands & Results
1. **Node E2E & Boundary Test Suites**:
   Command:
   ```bash
   node --test tests/e2e/tier1_features/f1_admin_auth.test.js tests/e2e/tier1_features/f2_security_rules.test.js tests/e2e/tier1_features/f12_whitelist_manager.test.js tests/e2e/tier2_boundary/f1_auth_boundary.test.js tests/e2e/tier2_boundary/f2_rules_boundary.test.js tests/e2e/tier2_boundary/f12_whitelist_boundary.test.js tests/e2e/tier3_integration/auth_to_navigation.test.js tests/e2e/tier3_integration/whitelist_lifecycle_to_auth_guard.test.js tests/e2e/tier4_scenarios/scenario1_super_admin_onboarding.test.js tests/e2e/tier4_scenarios/scenario2_non_admin_isolation.test.js
   ```
   Result: **39 / 39 tests passing (0 failures)**.

2. **Web Build Export Verification**:
   Command:
   ```bash
   cd app && npx expo export -p web
   ```
   Result: **Exit code 0, Web Bundled index.js (1147 modules) exported to dist**.

3. **Adversarial & Stress Tests**:
   Command:
   ```bash
   node --test tests/adversarial_edge_cases.test.js tests/adversarial_stress_test.js
   ```
   Result: **32 / 32 tests passing (0 failures)**.
