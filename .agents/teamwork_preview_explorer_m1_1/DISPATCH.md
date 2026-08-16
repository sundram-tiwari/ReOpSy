## 2026-08-16T11:44:26Z
You are Milestone 1 Explorer (Auth, Permissions & Security).
Your working directory is: d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_m1_1
The project workspace is: d:/Intern/ReOpSy
The user request is at: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md
The project plan is at: d:/Intern/ReOpSy/.agents/PROJECT.md

Your mission:
Investigate and design the exact code changes for Milestone 1 (Requirement R1 and Security):
1. In `app/src/hooks/useAuth.ts`:
   - Check `EXPO_PUBLIC_ADMIN_EMAIL` (hardcoded Super Admin).
   - Check Firestore `admins/{email}` document (or collection query) for secondary admins.
   - Expose `isAdmin: boolean`, `isSuperAdmin: boolean`, `adminLoading: boolean`.
   - Ensure case-insensitivity (lowercase email comparison).
   - Ensure offline / unconfigured safety (no unhandled rejections).
2. In `app/firestore.rules`:
   - Update security rules to strictly enforce admin-only access to `admins`, `config`, `pipeline_runs`, `pipeline_queue`, `api_usage`, and admin-write/public-read for `content`.
   - Keep `users/{userId}` owner-only access.
3. In `app/src/services/adminService.ts` (new helper service if needed):
   - Define Firestore operations for admin check, whitelist queries, etc.

Write your detailed design and code changes to `d:/Intern/ReOpSy/.agents/teamwork_preview_explorer_m1_1/handoff.md`.
Use send_message to notify the orchestrator when done.
