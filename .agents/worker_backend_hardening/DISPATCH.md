## 2026-08-16T12:14:24Z

You are the Backend Adversarial Hardening Worker for ReOpSy.
Your working directory is: d:/Intern/ReOpSy/.agents/worker_backend_hardening
The project workspace is: d:/Intern/ReOpSy
The authoritative user request is at: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md
The project plan is at: d:/Intern/ReOpSy/.agents/PROJECT.md
The Challenger 1 Tier 5 Report is at: d:/Intern/ReOpSy/.agents/challenger_e2e_1/handoff.md

Your exclusive write ownership files:
- `backend/pipeline/llm.js`
- `backend/pipeline/fetchAndSummarize.js`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your mission:
Apply the two adversarial robustness improvements identified by Challenger 1:
1. In `backend/pipeline/llm.js`:
   In `formatPrompt(template, originalTitle, summary)`:
   Use a function replacer rather than direct string replacement so that special replacement patterns (`$$`, `$&`, `$1`, etc. in math formulas or pricing) in `originalTitle` and `summary` are treated as literal characters:
   ```javascript
   function formatPrompt(template, originalTitle, summary) {
     if (!template || typeof template !== 'string') return '';
     const title = String(originalTitle || '');
     const summ = String(summary || '');
     let result = template;
     if (result.includes('{{originalTitle}}')) {
       result = result.replace(/\{\{originalTitle\}\}/g, () => title);
     }
     if (result.includes('{originalTitle}')) {
       result = result.replace(/\{originalTitle\}/g, () => title);
     }
     if (result.includes('{{summary}}')) {
       result = result.replace(/\{\{summary\}\}/g, () => summ);
     }
     if (result.includes('{summary}')) {
       result = result.replace(/\{summary\}/g, () => summ);
     }
     // Append if missing placeholders
     if (!template.includes('originalTitle') && !template.includes('Title')) {
       result += `\n\nOriginal Title: ${title}`;
     }
     if (!template.includes('summary') && !template.includes('Summary')) {
       result += `\nSummary: ${summ}`;
     }
     return result;
   }
   ```
2. In `backend/pipeline/fetchAndSummarize.js`:
   In `applyContentOverrides(feedData, db)`:
   Add null-safe guard so that if `adminPapers` contains `null` or items without `id`, it skips them cleanly:
   `if (p && p.id && overrideMap.has(p.id)) { ... }` and filter `p && !overrideMap.get(p.id)?.isDeleted`.
3. Verify:
   - `node tests/e2e/runner.js`
   - `cd app && npx tsc --noEmit`
   - `cd app && npx expo export -p web`

Write your handoff report to `d:/Intern/ReOpSy/.agents/worker_backend_hardening/handoff.md`.
Use send_message to notify the orchestrator when done.
