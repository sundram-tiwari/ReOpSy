# ReOpSy v2 replan

Research and execution pack, 2026-10-03.

| File | What it is | Who uses it |
|---|---|---|
| [research-report.html](research-report.html) | The full research: competitors, negative-review analysis, lessons, roadmap, free APIs, architecture, MVP plan, risks, monetization, with sources | You, mentors, anyone you share it with |
| [PRODUCT-SPEC.md](PRODUCT-SPEC.md) | The decisions distilled into one spec: rules, scope, kill list, contracts, pipeline, metrics, compliance | Every agent, attached to every prompt |
| [design-brief.md](design-brief.md) | 3 prompts: design system → screens → engineering handoff | Design tool |
| [build-playbook.md](build-playbook.md) | 12 phased prompts with acceptance checks, plus a review-mining side task | Coding agent (in this repo) |
| [assistant-tasks.md](assistant-tasks.md) | Writing and research jobs: gold-set labelling, seed papers, store copy, legal, recruiting, monthly watch | AI assistant |
| [data/sample-cards.json](data/sample-cards.json) | 8 real papers written in the v2 card format, 3 "before" failures from the current feed, example user state | Design tool (real content), Coding agent (fixtures and few-shot examples) |

## Who does what

```
            ┌───────────── You ─────────────┐
            │ accounts, API keys, gold-set  │
            │ labels, seed papers, testers, │
            │ every merge decision          │
            └──┬──────────────┬─────────────┘
               │              │
  AI assistant │              │ Design tool
   seeds, copy,│              │ system → screens → tokens.json + components.md
   legal, watch│              │
               ▼              ▼
            ┌──────────── Coding agent ─────────┐
            │ P0 hygiene → P1 audit → P2 catalog│
            │ → P3 sources → P4 rank → P5 summ. │
            │ → P6 publish → P7 data → P8 UI    │
            │ → P9 library/recall → P10 comply  │
            │ → P11 release                     │
            └───────────────────────────────────┘
```

## Order that avoids rework

1. **Week 1:** Code P0–P1. You label the gold set (chat task 1) and pick seed papers (chat task 2). Design Prompt 1 runs in parallel.
2. **Weeks 2–3:** Code P2–P6, the pipeline. Design Prompts 2–3 run in parallel.
3. **Weeks 4–6:** Code P7–P10, the app, built on the design handoff.
4. **Week 7:** Code P11. Start the 14-day closed test (chat task 5).
5. **Week 9+:** Production. Run chat task 6 monthly.

## Spend

| Item | Cost |
|---|---|
| Google Play developer account | $25 one-time (≈ ₹2,200) |
| Domain | Optional, ≈ ₹800–1,000/yr |
| Everything else | ₹0 on free tiers |

"Everything else" covers GitHub Actions, Cloudflare Pages/Workers/D1, Firebase Spark, Expo EAS free, the OpenAlex free key, and the Groq/Gemini/OpenRouter free tiers.
iOS ships as a PWA until the $99/yr Apple fee makes sense.
