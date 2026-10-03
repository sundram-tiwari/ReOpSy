# ReOpSy v2 app: setup and what's where

## Run it

```bash
cd app && npm install && npx expo start
```

The app works with no configuration. Without Firebase it runs offline: the bundled feed (with the quality gate),
the daily deck, recall, library, exports and Overleaf all work. The Community tab says it is offline.

## Turn on accounts and the community (Firebase, free Spark plan)

1. **Enable sign-in.** In the Firebase console, go to **Authentication → Sign-in method** and enable **Email/Password**.
   Also enable **Google** if you want Google sign-in on the web. Email sign-in is what works inside the Android app.
2. **Deploy rules and indexes** from the repo root:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   This uses `app/firestore.rules` and `firestore.indexes.json`. Indexes take a few minutes to build. Until they
   finish, Circles and Following show a loading error.
3. **Set the app's environment variables** in `app/.env`. They are public values, compiled into the bundle:

   | Variable | What it is |
   |---|---|
   | `EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | Firebase web config |
   | `EXPO_PUBLIC_ADMIN_EMAIL` | Super-admin email; can open Moderation |
   | `EXPO_PUBLIC_WEB_APP_URL` | Hosted web build. Android uses its `/overleaf.html` to open Overleaf |
   | `EXPO_PUBLIC_LEGAL_BASE_URL` | Where `legal/*.md` is published (trailing slash) |
   | `EXPO_PUBLIC_GRIEVANCE_EMAIL`, `EXPO_PUBLIC_TAKEDOWN_EMAIL` | Shown in Guidelines (required by the IT Rules) |
   | `EXPO_PUBLIC_COPYRIGHT_HOLDER` | Your full name, shown in the copyright notice |

## Structure

| Path | What |
|---|---|
| `app/src/logic/` | Pure, tested logic: deck (`triage`), recall, card view, quality gate (`feed`), exporters, Overleaf, Zotero mapping, social validation, saved-data migration and merge |
| `app/src/state/AppState.tsx` | Local-first state, migration from v2 storage, cloud sync when signed in |
| `app/src/state/Community.tsx` | Your profile, follows and unread state; the "sign in or create a profile first" gate |
| `app/src/services/community.ts` | Firestore: profiles, follows, recommendations, discussions, circles, reports, inbox, account deletion |
| `app/firestore.rules` | Server-side enforcement for every community write |
| `app/src/platform/` | File export, Overleaf hand-off, secure key storage, Zotero client |
| `app/src/ui/` | Design tokens (light and dark) and shared components |
| `app/public/overleaf.html` | Hand-off page that posts a survey to Overleaf from Android |

## What each tab does

| Tab | Job |
|---|---|
| **Today** | A finite deck (5/10/15) with four decisions per card: Not for me, Skip, Save, Survey. Undo on every decision. Ends with "You're caught up" and links to recall and the Following feed. |
| **Community** | Circles (public or invite-code groups with posts and replies), Following (recommendations from the last 14 days), People (search and suggestions). The inbox bell shows a dot, never a count. |
| **Library** | Saved, Read later and Survey. Notes and the 6-column literature matrix. Export to BibTeX, RIS, CSV, Markdown, or copy citations. Open as a survey in Overleaf, or send to Zotero. |
| **You** | Profile, weekly rhythm, streak with freezes, milestones for output, daily goal, theme, Zotero, data download, guidelines and legal pages, sign out, delete account. |

## Not yet verified against a live Firebase project

The rules and queries are written and type-checked, but could not run against the Firestore emulator here (it needs
Java). Before inviting testers, run the emulator and try each flow:

```bash
firebase emulators:start --only firestore,auth
```

Flows to try: create profile, follow, recommend, comment, mark Helpful, create and join a circle, post and reply,
report, block, and delete account.
