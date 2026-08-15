# START HERE

The code is written and tested. What is left is accounts, clicks and waiting.
Work top to bottom; each phase is independent enough that you can pause anywhere.

---

## Phase 1 — See it run (20 minutes)

```bash
cd app
npm install
npx expo install --fix
npx expo start
```

Install **Expo Go** from the Play Store, scan the QR. Swipe a few cards.

If the first boot trips:

```bash
npx expo-doctor
npx expo start -c        # clears the Metro cache
```

The app deliberately uses only classic APIs — `PanResponder` + `Animated`, React
Navigation, `AsyncStorage` — so this first boot should be boring.

**Tune your taste while you are here:** `app/src/config.ts` holds deck size,
topic list and copy. `app/src/data/demoPapers.ts` holds the seed papers.

---

## Phase 2 — Live data (45 minutes)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. SQL Editor → paste all of `backend/schema.sql` → Run.
3. Project Settings → API → copy the **Project URL** and the **service_role**
   key (the service key stays server-side only — never in the app).
4. ```bash
   cd backend
   cp .env.example .env      # fill SUPABASE_URL and SUPABASE_SERVICE_KEY
   node ingest/ingest.js --dry --topics ml --limit 5
   ```
   The `--dry` run prints three sample cards without touching the database. That
   confirms the network path. Then drop `--dry`:
   ```bash
   node ingest/ingest.js --topics ml,nlp,cv,systems,hci,bio --limit 40
   ```
5. In `app/`, create a `.env` file with the **anon** key (not service_role):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   Restart Expo. The You → Settings screen should now say **Live**.

---

## Phase 3 — Nightly automation (10 minutes)

Push the repo to GitHub, then Settings → Secrets and variables → Actions → add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_KEY` | service_role key |
| `INGEST_TOPICS` | `ml,nlp,cv,systems,hci,bio` |
| `INGEST_LIMIT` | `40` |

Actions tab → enable workflows. `.github/workflows/ingest.yml` then runs every
night at 02:15 UTC and can also be triggered by hand.

---

## Phase 4 — Legal docs (30 minutes)

Every file in `legal/` has `[[PLACEHOLDERS]]` in double square brackets. Search
for `[[` and replace all of them — your name, entity, city, contact email.

Then publish them:

1. Push the repo to GitHub.
2. Repo Settings → Pages → Source: `main`, folder `/legal` (or use `/docs`).
3. Set in `app/src/config.ts`:
   ```ts
   legalBaseUrl: 'https://<you>.github.io/reopsy/',
   takedownEmail: 'you@example.com',
   ```
   or set `EXPO_PUBLIC_LEGAL_BASE_URL` in `app/.env`.

Play Console will ask for a public privacy policy URL. That is
`<legalBaseUrl>privacy-policy` (or the raw `.md` if you skip Pages themes).

---

## Phase 5 — Accounts (₹2,000 + waiting)

- **Google Play Console** — $25 one-time, plus identity verification (photo ID,
  address). Verification can take a few days; start it early.
- **Recruit 15 testers.** Google requires **12 or more** testers opted in and
  active for **14 continuous days** before a personal developer account can
  publish to production. Collect 15 Gmail addresses to leave slack.
- **Expo account** — free, needed for `eas build`.

---

## Phase 6 — Build the AAB (30 minutes)

1. In `app/app.json`, change `com.CHANGEME.reopsy` to your real reverse-domain
   id. **This can never be changed after first upload.**
2. ```bash
   npm install -g eas-cli
   eas login
   cd app
   eas build:configure
   eas build --platform android --profile production
   ```
3. **Back up the keystore.** `eas credentials` → download → store it somewhere
   you will still have in five years. Lose it and you can never update the app
   under the same listing.

---

## Phase 7 — Closed test (14 days of waiting)

Play Console → Testing → Closed testing → create a track → upload the `.aab` →
add your 12+ testers by email → share the opt-in link. They must install and
keep it installed for 14 continuous days. Ship fixes during this window with
`eas update` (over-the-air, no new upload needed).

---

## Phase 8 — Copyright filing (₹500 + a few months)

```bash
node scripts/make-copyright-deposit.js
```

Produces `dist/copyright/deposit.html` (print to PDF from your browser),
`MANIFEST.txt`, and `SECRET-SCAN.txt`. **Read the secret scan report before
filing** — the deposit becomes a public record.

Then: [copyright.gov.in](https://copyright.gov.in) → register → **Form XIV**
(Computer Software) → ₹500 per work → upload the PDF deposit + your ID → save
the **Diary Number** that comes back. Expect a mandatory 30-day objection window
followed by examination.

---

## Phase 9 — Production

Play Console checklist before the publish button lights up:

- **Data safety form** — "No data collected", "No data shared". Everything is
  on-device; the only network call is a read of public paper metadata.
- **Health/medical declaration** — ReOpSy is not a medical app; answer no.
- **Content rating (IARC)** — reference to external scientific content; answer
  the questionnaire honestly. Expect a rating of 3+ or 12+, not 18+, unless you
  enable unfiltered biomedical topics.
- **Ads** — none.
- **Target audience** — 18+ or 13+, your call; 18+ keeps the Families policy out
  of scope.
- Screenshots: 2–8 phone shots, 1080×1920. Take them from Expo Go.

---

## Reference

| Thing | Where |
|---|---|
| App config, deck size, copy | `app/src/config.ts` |
| Seed papers | `app/src/data/demoPapers.ts` |
| Streak rules | `app/src/logic/streak.ts` |
| Ingest topics → API queries | `backend/ingest/lib/topics.js` |
| Database shape | `backend/schema.sql` |
| Copyright deposit | `scripts/make-copyright-deposit.js` |
