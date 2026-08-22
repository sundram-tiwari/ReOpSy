# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Small, focused team

This is a single self-contained fix; keep it small and focused.

Modify the ReOpSy backend pipeline to expose a webhook for a reliable cron mechanism on Render. Update the topics list to 5 specific research topics (plus a global shuffled feed) and adjust the LLM summary generation to enforce a strict word limit to prevent UI text overlap in the flashcards.

Working directory: d:/Intern/ReOpSy
Integrity mode: benchmark

## Requirements

### R1. Update Predefined Topics & Global Feed
Update the system's hardcoded topics to fetch papers for exactly these 5 topics: 
1. "AI in Mental Health"
2. "Autism Diagnosis using AI/ML/DL"
3. "Blockchain"
4. "Quantum Communication"
5. "Multi-camera Surveillance & Anomaly Detection"
Also, implement a "Global Feed" tab that consolidates all fetched papers into a single combined and shuffled list.

### R2. Limit Summary Word Count
Adjust the LLM system prompt (which uses Gemini, Mistral, and Grok) so that the generated abstract summary is strictly limited in word count (e.g., maximum 30 words). This guarantees the text fits within the mobile flashcard UI without overlapping other elements.

### R3. Reliable Daily Auto-Fetching Endpoint
Because Render's free tier spins down idle servers, the current `node-cron` approach fails. Expose a secure HTTP endpoint (webhook) in the backend that triggers the `fetchAndSummarize` pipeline. This will allow the user to ping the endpoint daily using a free external service like cron-job.org.

## Acceptance Criteria

### Content Updates
- [ ] Running `cd app && npx tsc --noEmit` verifies the new topic structures without type errors.
- [ ] The app displays exactly the 5 new topics and a "Global Feed".
- [ ] A visual check of the UI confirms that flashcard summaries no longer overflow or overlap with the footer.

### Automation Verification
- [ ] Sending an HTTP GET/POST request to the new webhook endpoint successfully triggers the pipeline execution in the logs.
- [ ] The endpoint is protected (e.g., requiring a secret token in the header or query params) so unauthorized users cannot trigger expensive LLM pipeline runs.

---
*Next: when approved → delegate via invoke_subagent (see Delegation Protocol)*
