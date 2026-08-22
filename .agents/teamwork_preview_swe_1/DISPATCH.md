## 2026-08-22T05:22:20Z

You are the SWE Light orchestrator for the ReOpSy project.
Your working directory is: d:/Intern/ReOpSy/.agents/teamwork_preview_swe_1
The workspace directory is: d:/Intern/ReOpSy
The original user request is recorded in: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md

Your task is to implement and verify the following requirements:
1. Update Predefined Topics & Global Feed:
   - Update the system's hardcoded topics to fetch papers for exactly these 5 topics:
     1. "AI in Mental Health"
     2. "Autism Diagnosis using AI/ML/DL"
     3. "Blockchain"
     4. "Quantum Communication"
     5. "Multi-camera Surveillance & Anomaly Detection"
   - Implement a "Global Feed" tab that consolidates all fetched papers into a single combined and shuffled list.
2. Limit Summary Word Count:
   - Adjust the LLM system prompt (which uses Gemini, Mistral, and Grok) so that the generated abstract summary is strictly limited in word count (e.g., maximum 30 words) to guarantee text fits within mobile flashcard UI without overlapping.
3. Reliable Daily Auto-Fetching Endpoint:
   - Expose a secure HTTP endpoint (webhook) in the backend that triggers the `fetchAndSummarize` pipeline.
   - Protect the endpoint with a secret token (e.g. in header or query param) so unauthorized users cannot trigger pipeline runs.

Acceptance Criteria:
- `cd app && npx tsc --noEmit` verifies the new topic structures without type errors.
- The app displays exactly the 5 new topics and a "Global Feed".
- Flashcard summaries no longer overflow or overlap with footer elements.
- Sending an HTTP request with auth token to webhook successfully triggers pipeline execution; unauthorized requests are rejected.
- Run tests and verify the entire solution.

Maintain progress in your progress.md and BRIEFING.md. When complete, provide a handoff report and notify me.
