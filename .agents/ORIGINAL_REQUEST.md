# Original User Request

## 2026-08-16T06:34:37Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: [none — teamwork routes from the description]

Build Version 2 of ReOpSy, a scalable, personalized, mobile-first flashcard app for research papers.

Working directory: d:/Intern/ReOpSy
Integrity mode: demo

## Verification Resources
The project uses standard Expo/React Native build tools for the frontend (`npx tsc`, `npx expo export`) and Node.js for the backend pipeline. Use these to verify type safety and build correctness.

## Requirements

### R1. Predefined Categories Must Have Content
All 10 predefined/default categories (Machine Learning, Computer Vision, etc.) must contain relevant flashcards. Integrate Semantic Scholar API to fetch free `tldr` summaries and implement a multi-LLM fallback (Gemini → Mistral → Grok) for generating catchy titles. If a fetch fails, keep existing DB papers. Do not show an empty category.

### R2. Google Authentication and Persistent User Settings
Add Google Authentication for user login and account management using Firebase Auth. After authentication, maintain a user profile and persist relevant settings/preferences to Firestore. Ensure the app falls back gracefully to AsyncStorage when logged out.

### R3. Mobile-First Flashcard Experience & UI
Fix the footer background consistency so the action area (Like/Share/Save) integrates visually into the page. Redesign the flashcards specifically for a mobile-first experience (touch-friendly, snap-scrolling, no truncation in summaries, identical font sizes for title and summary). Minimize cognitive load by replacing all emojis with Feather vector icons and removing unnecessary UI elements.

### R4. User API Integration and Personalized Topic
Add a Settings screen allowing users to securely connect their own API key (Gemini, Mistral, Grok, or Custom) and provide a highly specific custom research topic (e.g., "Explainable AI for Depression Detection"). Use this API to fetch personalized live content for their topic without disrupting the default application experience.

### R5. Scalable Content Architecture & Security
Design a multi-level data model (Default Categories → User-Customized Topics → User API Content → Highly Specific Research Content). Ensure user API keys are handled securely in Firestore (never exposed in client logs or source code).

## Acceptance Criteria

### Programmatic Verification (Automated)
- [ ] `cd app && npx tsc --noEmit` completes with zero type errors.
- [ ] `cd app && npx expo export -p web` completes successfully and produces a web build.
- [ ] `cd backend && node pipeline/fetchAndSummarize.js --dry` executes without fatal errors and processes all 10 topics.

### Functional Verification (Agent-as-Judge)
- [ ] **Mobile UI:** The flashcard UI uses snap-scrolling, has touch targets >= 48px, uses Feather icons (no emojis), and integrates the footer background seamlessly.
- [ ] **Auth & Settings:** A user can navigate to the Settings screen, enter an API key securely (masked input), and the application state correctly updates (saving to Firestore or AsyncStorage).
- [ ] **Pipeline Execution:** The Semantic Scholar API fetch correctly extracts TLDRs, and the multi-LLM module successfully catches failures and falls back down the chain (Gemini → Mistral → Grok → original title).
