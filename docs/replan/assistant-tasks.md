# Assistant tasks (an AI chat assistant with web research)

These are writing and research jobs that don't need the codebase. Attach `PRODUCT-SPEC.md` to each.

## 1. Gold-set labelling helper (before Code Phase 4)

```
I'm labelling papers for my topic "<topic>" as relevant (1) or not (0) for a researcher whose
interest is: "<one paragraph describing your exact research angle>". For each row of the
attached CSV, suggest a label and a 6-word reason. Mark anything borderline as "?" so I decide.
Do not change ids or titles.
```

You make the final call on every "?". This file defines what "relevant" means for your app.

## 2. Seed papers per topic (Research on)

```
For the research topic "<topic>", find 8 recent (2023–2026), highly relevant, open-access papers
that together span its main sub-directions. Return arXiv IDs or DOIs only from sources you
verified, with one line each on why it is central. No predatory venues.
```

## 3. Store listing and screenshots copy

```
Write a Google Play listing for ReOpSy: a 30-char title, an 80-char short description and a
4,000-char full description. Voice: plain, specific, no hype, no "AI-powered" in the title.
Lead with the outcome: a finite daily deck, recall, and a literature matrix you can export.
State clearly: free to read, no ads, summaries are AI-written and checkable. Then write
captions for 6 screenshots (Today, Card, Caught up, Recall, Matrix, Export).
```

## 4. Legal refresh

```
Update the attached privacy policy and terms for this architecture: optional Google sign-in
(email, user ID), Firestore sync of the user's library, a local-only reminder, an anonymous
summary-report endpoint (paper ID, reason, app version), no ads, no sale of data, in-app and
web account deletion, India DPDP Act (grievance contact, rights, breach notice) and a
"not medical advice" clause for health topics. Mark every placeholder [[LIKE_THIS]].
Flag anything that needs a lawyer.
```

## 5. Closed-test recruiting message

```
Write a short WhatsApp/email message inviting 15 people from my department to test ReOpSy for
14 days. Explain what it is in 2 lines, what they must do (opt in via link, install, open it
at least 3 times a week), how long it takes, and that their feedback shapes the app.
```

## 6. Monthly competitor and policy watch (Research on, first Monday of each month)

```
Check for changes since <last date> in: OpenAlex API pricing/limits, arXiv API terms,
Crossref REST limits, Semantic Scholar API licence, Gemini/Groq/OpenRouter free tiers,
Cloudflare/Firebase/Expo free plans, Google Play developer policies (AI content, data safety,
testing requirements), India DPDP Rules and IT Rules. Also check new launches or major
updates from R Discovery, Researcher, Scholar Inbox, alphaXiv and Hugging Face Papers.
Report only changes, each with a source link and what ReOpSy should do about it.
```
