## 2026-08-16T06:43:18Z

You are Worker 3 implementing Milestone 3 (Mobile-First Flashcard UX - R3) for ReOpSy Version 2.

Your working directory: d:/Intern/ReOpSy/.agents/teamwork_preview_worker_m3_1
Original request path: d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md
Project specification path: d:/Intern/ReOpSy/.agents/PROJECT.md

File Write Ownership (Exclusively owned by you):
- `app/src/screens/FeedScreen.tsx`
- `app/src/components/PaperCard.tsx`
- `app/src/components/TopicTabs.tsx`
- `app/src/components/ActionBar.tsx`
- `app/src/screens/SavedScreen.tsx`
- `app/src/screens/PersonalizationScreen.tsx`
- `app/src/components/DrawerContent.tsx`
- `app/src/config.ts`
- `app/tsconfig.test.json`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Instructions:
1. Read `d:/Intern/ReOpSy/.agents/ORIGINAL_REQUEST.md` and `d:/Intern/ReOpSy/.agents/PROJECT.md`.
2. Implement all Milestone 3 requirements:
   - **Snap-Scrolling**: In `FeedScreen.tsx`, measure `containerHeight` via `onLayout`, pass `cardHeight={containerHeight}` to `PaperCard`, set `snapToInterval={containerHeight}`, `snapToAlignment="start"`, `decelerationRate="fast"`, `pagingEnabled={Platform.OS === 'ios'}`, and provide `getItemLayout`.
   - **Touch Targets >= 48px**: Ensure all touchables (menu button in `FeedScreen`, pills in `TopicTabs`, link rows in `PaperCard`, back/trash/link buttons in `SavedScreen`, close/follow buttons in `PersonalizationScreen`, drawer items) have `minWidth: 48, minHeight: 48` (or `padding/hitSlop` >= 48px) with centered alignment.
   - **Feather Vector Icons**: Remove all emoji literals from `config.ts` and `types.ts`. Replace all Unicode glyphs (`↗`, `✓`, `+`) in `SavedScreen.tsx` and `PersonalizationScreen.tsx` with Feather vector icons (`external-link`, `check`, `plus`).
   - **Seamless Footer Action Area**: Integrate `ActionBar` seamlessly into the card container with matching background (`colors.bg`), clean spacing, and safe-area insets consideration.
   - **Typography Parity & No Truncation**: Maintain identical 16px font size for both title and summary (`typography.h1` and `typography.body`), ensure no `numberOfLines` truncation, and optimize flex layout for all mobile viewport heights.
   - **Fix TS5107 Deprecation**: Update `app/tsconfig.test.json` moduleResolution to `NodeNext` or add `"ignoreDeprecations": "6.0"`.
3. Verification:
   - Run `npx tsc --noEmit` in `app/` (must pass with 0 errors).
   - Run `npx expo export -p web` in `app/` (must succeed).
   - Run `npm test` in `app/` (must pass).
4. Document all changes and verification command outputs in `d:/Intern/ReOpSy/.agents/teamwork_preview_worker_m3_1/handoff.md` and send a message when done.
