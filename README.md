# ReOpSy

**Research, one swipe at a time.**

ReOpSy is a swipe-first reading habit app for scientific papers. Open it, get a
small hand-picked deck of recent papers in the fields you care about, swipe right
to save, left to skip, up to open. Everything lives on your device — no accounts,
no tracking, nothing to breach.

```
ReOpSy/
├── app/                 Expo + TypeScript mobile app (Android/iOS)
├── backend/             Supabase schema + zero-dependency ingest pipeline
├── legal/               Privacy policy, terms, disclaimer, takedown policy
├── scripts/             Copyright deposit generator
└── .github/workflows/   Nightly ingest automation
```

## Quick start (5 minutes, no backend needed)

```bash
cd app
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone. The app ships in **demo mode** by
default with 30 seeded papers across six fields, so it is fully usable and
demoable without any server.

## Going live (optional)

1. Create a Supabase project, paste `backend/schema.sql` into the SQL editor.
2. `cp backend/.env.example backend/.env` and fill in the two values.
3. `cd backend && node ingest/ingest.js --topics ml,nlp --limit 40`
4. In `app/`, create `.env` with:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   Restart Expo. The app switches to live mode automatically.

## Tests

```bash
cd backend && npm test    # ingest pipeline
cd app     && npm test    # pure logic, strict TypeScript
```

Both suites are dependency-free (`node --test`) and run in a couple of seconds.

## Design decisions that matter

- **No accounts, all on-device.** Play Store Data Safety answer is "no data
  collected". Nothing to leak, no DPDP machinery required.
- **Demo mode by default.** The app never hard-fails because a server is down.
- **License gating in the schema.** `license_ok` decides whether an abstract may
  be shown verbatim; the card component enforces it again at render time.
- **AI-condensed labels** on every generated summary, on the card and the detail
  screen.
- **Scholar-search fallback links** in the seed data, so a wrong DOI can never
  ship in the demo set.

See `docs/IMPLEMENTATION-PLAN.md` in the project knowledge for the stage-by-stage
launch checklist, and `START-HERE.md` for the ordered list of things only you can
do (accounts, keystore, filings).
