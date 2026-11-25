# Design brief — ReOpSy v2

**Where to run:** An AI design tool, one conversation per prompt below, in order.
**Attach to every prompt:** `PRODUCT-SPEC.md` and `data/sample-cards.json` from this folder.
Optionally attach a screenshot of the current app as a "what we are moving away from" reference.
**Output you hand to the coding agent:** the tokens JSON, component specs and screen list from Prompt 3.

---

## Prompt 1: Design system

```
You are designing the visual system for ReOpSy, a mobile app (Android first, plus a web PWA) that
gives researchers a short, finite daily deck of paper cards, asks a few recall questions about
saved papers, and builds a literature-review matrix they can export. Read the attached
PRODUCT-SPEC.md first; its "Ten product rules" are binding.

Audience: PhD students, early researchers and serious enthusiasts. They read dense technical
text, often at night, often on mid-range Android phones. They distrust hype and clickbait.

Produce a design system with:
1. Colour tokens for light AND dark themes (dark is not an inversion; design both with equal care).
   Include semantic tokens for: preprint, peer-reviewed, open PDF, retracted, code available,
   AI-written label, serendipity card. Status must never rely on colour alone (icon + text too).
   Check WCAG 2.2 AA contrast for every text/background pair and list the ratios.
2. Type scale for: card headline, summary body, summary part labels (Problem / Approach /
   Result / Limits), metadata, identifiers (arXiv IDs, DOIs, key numbers). Use a monospaced or
   tabular face for identifiers and numbers. Must stay readable at 200% system font size.
3. Spacing, radius and elevation scales; 48dp minimum touch targets.
4. Components with all states: PaperCard (default, saved, not-relevant exit, retracted,
   serendipity, offline), StatusChip, KeyNumber, ActionBar (Not relevant / Save / Read later /
   Add to survey), TopicChip, ProgressRing (daily goal), WeekRhythm (7-day dots with freeze),
   RecallCard (question / reveal / self-grade), MatrixRow, BottomSheet, EmptyState, Toast.

Explore TWO directions on one canvas, then recommend one:
  A. "Field notebook": paper-white and ink, a highlighter accent used the way people
     highlight a PDF.
  B. "Instrument panel": dark-first deep slate, precise monospaced data, a calm signal accent.
Avoid: the current X/Twitter clone look (pure black + #1d9bf0), purple gradients, cream +
terracotta serif, emoji as icons, Inter/Space Grotesk as the default face.
```

## Prompt 2: Core screens (mobile 390×844, plus the matrix at 1280 wide)

```
Using the chosen direction from the design system, design these screens with REAL content from
the attached sample-cards.json (never lorem ipsum). Every AI summary shows the
"AI-written summary · check the abstract" label.

1. Onboarding (3 steps, skippable): (a) role + daily goal 5/10/15 cards; (b) pick topics from a
   catalog, where tapping a topic shows a 5-paper PREVIEW sheet before subscribing; (c) optional
   reminder time, with copy that promises max one reminder a day.
2. Today: deck header with progress ring (6 of 10), the PaperCard (headline, original title,
   four labelled summary parts, key numbers, chips, "Why you're seeing this"), and the action bar.
   Show the swipe/tap affordances and the not-relevant feedback sheet (Off-topic / Low quality /
   Already know it).
3. Reading ladder: card → full abstract → open PDF (shows OA source) → add note. Include the
   "Report summary" bottom sheet (Wrong number / Overclaims / Off-topic / Other).
4. Caught up: end-of-deck screen. Today's summary (seen, saved, added to survey), next recall
   time, and a single "Explore one more topic" option. No auto-advance into more content.
5. Recall: 3 questions from previously saved cards (use the "recall" field), reveal answer,
   self-grade (Forgot / Fuzzy / Knew it).
6. Library: Saved / Read later / Survey tabs, search, filters (topic, year, preprint vs
   peer-reviewed, open PDF), export button (BibTeX / RIS / CSV).
7. Survey matrix: mobile (row cards) AND desktop 1280px (spreadsheet table using the
   "matrixRow" fields: task, method, data, metric, result, limitation; editable cells).
8. You: weekly rhythm (7 dots, freezes), streak (12 current / 19 longest), milestones tied to
   output, survey progress (14 of 40). Use exampleUserState; mark it as example data.
9. Settings: topics, daily goal, reminder, data export, sign in to sync (optional),
   delete account, licences & sources, "not medical advice" note.
10. States: first-run empty library, offline (cached deck still works), feed failed to load,
    topic with no new papers today ("Nothing new that passes our quality bar today").

Also show ONE before/after frame: the first beforeExamples card (truncated summary) next to the
v2 card for the same paper (arxiv:2608.12750).
```

## Prompt 3: Handoff for the coding agent

```
Prepare an engineering handoff for a React Native (Expo SDK 57, TypeScript) codebase:
1. tokens.json: colours (light + dark), typography, spacing, radius, elevation, motion
   durations (respect reduce-motion: provide a no-motion variant for every animation).
2. One spec per component: props (TypeScript), states, layout measurements, accessibility
   labels and roles, and which tokens it uses.
3. Screen inventory: route names, which components each screen uses, and empty/error/offline states.
4. Gesture spec for the deck: swipe thresholds, haptics, and button equivalents for every
   gesture (gestures are never the only way to act).
5. Copy deck: every user-facing string, including notifications. Rules: plain, specific, no
   guilt, no hype.
Output tokens.json and components.md as files I can drop into docs/replan/design/.
```

---

## Non-negotiables to check in every design output

- [ ] The deck visibly ends. No infinite scroll anywhere.
- [ ] Every AI summary carries the label and has a report path within one tap.
- [ ] Open-access status is visible before tapping out.
- [ ] Every gesture has a button equivalent; touch targets are ≥48dp; contrast is AA in both themes.
- [ ] No red badge counts, countdowns, leaderboards or guilt copy.
- [ ] Identifiers and numbers use the tabular/mono face; long titles wrap and are never truncated mid-word.
