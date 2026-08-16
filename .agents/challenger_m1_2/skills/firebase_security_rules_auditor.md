# Firebase Security Rules Auditor Skill Reference

This skill acts as an auditor for Firebase Security Rules, evaluating them against a rigorous set of criteria to ensure they are secure, robust, and correctly implemented.

## Mandatory Audit Checklist:
1. The Update Bypass: Compare 'create' and 'update' rules. Can a user create a valid document and then 'update' it into an invalid or malicious state?
2. Authority Source: Does security rely on user-provided data for sensitive fields?
3. Business Logic vs. Rules: Does the rule set support the app's purpose without breaking legitimate access?
4. Storage Abuse / Resource Exhaustion: Are there potential denial-of-service risks?
5. Type Safety & Field Checks: Are fields and tokens validated?
6. Field-Level vs. Identity-Level Security: Are ownership and role checks strictly enforced?
