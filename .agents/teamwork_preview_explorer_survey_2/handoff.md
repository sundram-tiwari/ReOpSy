# Frontend App & Mobile UX Exploration Report (ReOpSy v2)

## Executive Summary
This report provides a thorough read-only investigation of the `app/` codebase in `d:/Intern/ReOpSy` for **Explorer 2 (Frontend App & Mobile UX)**. The frontend is built with Expo SDK 57, React Native 0.86.2, and React 19.2.3.
Both **TypeScript typechecking** (`npx tsc --noEmit`) and **Expo web export** (`npx expo export -p web`) execute with **exit code 0** (3.4MB static bundle in `dist/`).
However, we identified critical UI/UX gaps relative to requirement **R3** (Mobile-First Flashcard Experience & UI), touch target accessibility non-compliance (< 48px), snap-scrolling viewport misalignment, deprecated emojis / raw Unicode characters in place of Feather vector icons, and a TypeScript configuration deprecation in `tsconfig.test.json`.

---

## 1. Observation

### 1.1 Automated Tooling & Build Verification
1. **TypeScript Typecheck (`npx tsc --noEmit`)**:
   - Command: `npx tsc --noEmit` executed in `d:/Intern/ReOpSy/app`.
   - Result: Exit code `0` (Zero type errors).
2. **Expo Web Export (`npx expo export -p web`)**:
   - Command: `npx expo export -p web` executed in `d:/Intern/ReOpSy/app`.
   - Result: Exit code `0` (Output bundled to `dist/`, 3.4MB static JS web bundle, 31 vector icon font assets).
3. **Unit Tests Compilation (`npm test` / `tsc -p tsconfig.test.json`)**:
   - Command: `npm test` executed in `d:/Intern/ReOpSy/app`.
   - Result: Exit code `1`.
   - Verbatim error:
     ```
     tsconfig.test.json(6,25): error TS5107: Option 'moduleResolution=node10' is deprecated and will stop functioning in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"' to silence this error.
     ```

### 1.2 Codebase Structure & File Inventory
The frontend architecture resides in `d:/Intern/ReOpSy/app/src/`:
- `App.tsx`: Root wrapper with `GestureHandlerRootView`, `SafeAreaProvider`, `AppStateProvider`, and `RootNavigator`.
- `navigation/RootNavigator.tsx`: Navigation stack containing `DrawerNavigator` (`FeedScreen`) and native stack screens (`PersonalizationScreen` [modal], `SavedScreen`, `SettingsScreen`).
- `screens/FeedScreen.tsx`: Main card feed screen using `FlatList` with `pagingEnabled={true}`.
- `screens/PersonalizationScreen.tsx`: Topic subscription management modal.
- `screens/SavedScreen.tsx`: Bookmarked research paper reading list.
- `screens/SettingsScreen.tsx`: User profile, API provider configuration (Gemini / Mistral / Grok / Custom), custom research topic, and app data clear actions.
- `components/PaperCard.tsx`: Single flashcard view rendering title, summary, authors, venue, external link, and `ActionBar`.
- `components/ActionBar.tsx`: Thumbs-up like counter, bookmark save button, and native share sheet trigger.
- `components/TopicTabs.tsx`: Horizontally scrollable pill tabs for switching active feed topics.
- `components/DrawerContent.tsx`: Navigation drawer showing user profile / Google login button, daily streak stats, activity counts, and route links.
- `state/AppState.tsx`: React Context managing `followedTopics`, `activeTopic`, `savedPapers`, `likedPapers`, `streak`, `userApiConfig`, syncing to `AsyncStorage` and Firestore (`users/{uid}`).
- `hooks/useAuth.ts`: Firebase Authentication hook (`signInWithGoogle`, `signOut`, `onAuthStateChanged`).
- `services/firebase.ts`: Firebase App, Auth, and Firestore initialization.
- `theme.ts`: Theme tokens (colors, spacing, typography).
- `config.ts`: App configurations and default topic definitions.
- `types.ts`: TypeScript data models (`Paper`, `Topic`, `StreakState`).

---

### 1.3 Detailed UI/UX Observations & Gaps

#### A. Snap-Scrolling Implementation
- **Location**:
  - `d:/Intern/ReOpSy/app/src/screens/FeedScreen.tsx:65-74`
  - `d:/Intern/ReOpSy/app/src/components/PaperCard.tsx:9-11, 73-78`
- **Current Code**:
  - In `FeedScreen.tsx`:
    ```tsx
    <FlatList
      ref={flatListRef}
      data={activePapers}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <PaperCard paper={item} />}
      pagingEnabled={true}
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
    />
    ```
  - In `PaperCard.tsx`:
    ```tsx
    const SCREEN_HEIGHT = Dimensions.get('window').height;
    const HEADER_OFFSET = 120;
    ...
    cardContainer: {
      height: SCREEN_HEIGHT - HEADER_OFFSET,
      backgroundColor: colors.bg,
      flexDirection: 'column',
      justifyContent: 'space-between',
    }
    ```
- **Flaw**:
  `HEADER_OFFSET` is statically hardcoded to `120`. In reality, the header height is ~52px and topic tabs are ~49px (~101px total), not accounting for dynamic safe area insets (status bar / iPhone notch ~44px, home indicator ~34px, or Android navigation bar).
  Because the item height (`SCREEN_HEIGHT - 120`) does not match the actual viewport height of the `FlatList` container, `pagingEnabled={true}` leads to progressive vertical alignment drift when swiping through cards. On Android and Web, `pagingEnabled` on `FlatList` without `snapToInterval`, `snapToAlignment="start"`, and `decelerationRate="fast"` can cause inconsistent or non-snapping scroll behavior.

#### B. Touch Target Sizes (< 48px Non-Compliance)
Accessibility guidelines and Acceptance Criterion R3 require touch targets >= 48px. We audited every touchable component:

| File & Line | Element | Current Dimensions | Compliant (>= 48px)? |
|---|---|---|---|
| `FeedScreen.tsx:98-100` | `menuButton` (`TouchableOpacity`) | `padding: 8` around 24px icon -> **40x40px** | ❌ No |
| `TopicTabs.tsx:64-74` | `pill` (`TouchableOpacity`) | `paddingVertical: 8`, font 16px -> **~32px height** | ❌ No |
| `PaperCard.tsx:117-123` | `linkRow` (`TouchableOpacity`) | `paddingVertical: 8`, font 14px -> **~32px height** | ❌ No |
| `SavedScreen.tsx:78-81` | `backBtn` (`TouchableOpacity`) | `padding: 8` around 24px icon -> **40x40px** | ❌ No |
| `SavedScreen.tsx:108-113` | `linkBtn` (`TouchableOpacity`) | `paddingVertical: 8` -> **~34px height** | ❌ No |
| `SavedScreen.tsx:55-57` | Trash icon (`TouchableOpacity`) | No padding around 20px icon -> **20x20px** | ❌ No |
| `PersonalizationScreen.tsx:73-78` | `closeBtn` (`TouchableOpacity`) | `padding: 8` around 20px icon -> **36x36px** | ❌ No |
| `PersonalizationScreen.tsx:114-119` | `followBtn` (`TouchableOpacity`) | `paddingVertical: 8` -> **~36px height** | ❌ No |
| `SettingsScreen.tsx:224-227` | `backButton` (`TouchableOpacity`) | `padding: 8` around 24px icon -> **40x40px** | ❌ No |
| `SettingsScreen.tsx:340-346` | `providerChip` (`TouchableOpacity`) | `paddingVertical: 8` -> **~32px height** | ❌ No |
| `SettingsScreen.tsx:296-302` | `buttonOutline` (`TouchableOpacity`) | `paddingVertical: 8` -> **~34px height** | ❌ No |
| `ActionBar.tsx:82-92` | `iconButton` (`TouchableOpacity`) | `minWidth: 60, minHeight: 48` | ✅ Yes |
| `DrawerContent.tsx:189-194` | `menuItem` (`TouchableOpacity`) | `paddingVertical: 24` -> **~68px height** | ✅ Yes |
| `DrawerContent.tsx:146-153` | `googleButton` (`TouchableOpacity`) | `padding: 16` -> **~52px height** | ✅ Yes |

#### C. Icon Usage & Emojis / Raw Unicode Characters to Replace
- `d:/Intern/ReOpSy/app/src/config.ts:3-14`: All 10 topic definitions still define `emoji` fields (`'🤖'`, `'🧠'`, `'📝'`, `'👁️'`, `'🧘'`, `'💬'`, `'🦾'`, `'🔒'`, `'📊'`, `'🧬'`), although Feather icon names are already present in `icon`.
- `d:/Intern/ReOpSy/app/src/types.ts:20`: `Topic` interface contains `emoji?: string;`.
- `d:/Intern/ReOpSy/app/src/screens/SavedScreen.tsx:52`: `<Text style={styles.linkText}>Read full paper ↗</Text>` uses a raw Unicode character `↗` instead of `<Feather name="external-link" size={14} />`.
- `d:/Intern/ReOpSy/app/src/screens/PersonalizationScreen.tsx:45`: `{isFollowing ? '✓ Following' : '+ Follow'}` uses raw Unicode characters `✓` and `+` instead of `<Feather name={isFollowing ? "check" : "plus"} size={14} />`.

#### D. Footer Action Area Background Styling & Seamless Integration
- **Location**: `d:/Intern/ReOpSy/app/src/components/ActionBar.tsx:73-81` and `PaperCard.tsx:67`
- **Current Styling**:
  ```tsx
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.m,
    paddingBottom: spacing.l,
    backgroundColor: colors.bg,
  }
  ```
- **Analysis**:
  The `ActionBar` is currently placed as the direct trailing child inside `PaperCard`.
  Both `PaperCard` and `ActionBar` use `colors.bg` (`#000000`), so the footer action area background blends seamlessly into the card container. The buttons themselves (`iconButton`) use `backgroundColor: colors.accent` (`#292929`) with `minHeight: 48` and `minWidth: 60`.
  To ensure perfect seamlessness across all devices:
  - Add safe area inset consideration (`useSafeAreaInsets().bottom`) so buttons are not obstructed by home navigation bars on gesture-enabled phones.
  - Keep padding unified with card borders.

#### E. Typography (Title vs Summary Font Sizes & No Truncation)
- **Location**:
  - `d:/Intern/ReOpSy/app/src/theme.ts:25, 28`
  - `d:/Intern/ReOpSy/app/src/components/PaperCard.tsx:99-110`
- **Current Font Specs**:
  - Title: Uses `typography.h1` which is defined as `{ fontSize: 16, fontWeight: 'bold', color: colors.text, lineHeight: 24 }`.
  - Summary: Uses `typography.body` which is `{ fontSize: 16, fontWeight: 'normal', color: colors.textDim, lineHeight: 28 }`.
  - Font Size Parity: Both title and summary use exactly **16px** (`fontSize: 16`).
  - Truncation: Neither title nor summary has `numberOfLines` set in `PaperCard.tsx`. Full text renders without truncation.
- **Layout Risk**:
  `PaperCard.tsx:83` uses `justifyContent: 'space-evenly'` inside `styles.content`. On small screens (e.g. 667px / iPhone SE), long 3-sentence summaries can push the metadata or action bar out of view. Changing the card layout to flex sections (`headerTag`, `mainBody`, `footerActions`) with clean spacing ensures complete visibility on all screen aspect ratios.

---

## 2. Logic Chain

1. **Snap-Scrolling Determinism**:
   - *Observation*: `Dimensions.get('window').height - 120` in `PaperCard.tsx` produces an arbitrary item height that deviates from the true container height rendered by `FlatList` in `FeedScreen.tsx`.
   - *Inference*: FlatList pagination (`pagingEnabled`) relies on item heights matching the viewport container height. Any mismatch accumulates error per card, leading to partial cards cut off at screen edges.
   - *Conclusion*: `FeedScreen.tsx` must measure container height on layout (`onLayout`), pass this exact height to each `PaperCard`, and supply `snapToInterval={containerHeight}`, `snapToAlignment="start"`, `decelerationRate="fast"`, and `getItemLayout` to `FlatList`.

2. **Touch Target Accessibility Compliance (>= 48px)**:
   - *Observation*: Ten distinct interactive touchables across 5 screens/components have bounding boxes between 20px and 40px due to small padding (`padding: 8`) and lack of `minWidth`/`minHeight`.
   - *Inference*: Touch targets below 48x48px violate mobile accessibility standards (WCAG 2.5.5 / Android Material guidelines) and fail Acceptance Criterion R3.
   - *Conclusion*: Every interactive button/icon must have `minWidth: 48, minHeight: 48` (or `hitSlop: { top: 8, bottom: 8, left: 8, right: 8 }` / `padding: 12+`) and centered flex content.

3. **Vector Icon Standardization**:
   - *Observation*: `config.ts` maintains redundant emoji properties, while `SavedScreen.tsx` and `PersonalizationScreen.tsx` embed Unicode glyphs (`↗`, `✓`, `+`).
   - *Inference*: Emojis and Unicode glyphs render with inconsistent fonts, colors, and OS-dependent alignments, conflicting with R3's requirement: *"Minimize cognitive load by replacing all emojis with Feather vector icons"*.
   - *Conclusion*: Remove emojis from configuration and models; replace all Unicode characters with `@expo/vector-icons` Feather components (`check`, `plus`, `external-link`).

4. **Test Suite Deprecation Resolution**:
   - *Observation*: `npm test` fails with `TS5107: Option 'moduleResolution=node10' is deprecated`.
   - *Inference*: TypeScript 6.0 / 7.0 deprecates legacy `node` resolution in `tsconfig.test.json`.
   - *Conclusion*: Update `tsconfig.test.json` to `"moduleResolution": "NodeNext"` and `"module": "NodeNext"`, or set `"ignoreDeprecations": "6.0"`.

---

## 3. Caveats

1. **Read-Only Explorer Mandate**: In accordance with the Explorer role instructions, no source files were directly modified during this survey. All proposed code modifications are provided as exact before/after specifications.
2. **Backend Feed Integration**: The frontend is currently loaded from `src/data/dailyFeed.json`. Dynamic updates from the multi-LLM backend pipeline will update this JSON file or stream from Firestore; the frontend state manager (`AppState.tsx`) already handles reactive loading.
3. **Web vs Native Safe Area Differences**: On web browsers, safe area insets return 0, whereas on iOS/Android devices with notches, insets are positive. Using `useSafeAreaInsets()` handles both gracefully.

---

## 4. Conclusion & Proposed Architecture

The frontend application has a solid architectural foundation (clean state management in `AppState.tsx`, modular screen routing, robust streak calculation logic, and working Expo web export).
To achieve full compliance with Version 2 Acceptance Criteria, the implementation team should apply the following targeted updates:

### Recommended Component & Screen Refactor Specifications

#### 1. `d:/Intern/ReOpSy/app/src/screens/FeedScreen.tsx`
```tsx
// Before (Lines 24, 65-75, 98-100):
export const FeedScreen: React.FC<Props> = ({ navigation }) => {
  ...
  const flatListRef = useRef<FlatList>(null);
  ...
  <FlatList
    ref={flatListRef}
    data={activePapers}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => <PaperCard paper={item} />}
    pagingEnabled={true}
    showsVerticalScrollIndicator={false}
    onViewableItemsChanged={handleViewableItemsChanged}
    viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
  />
  ...
  menuButton: {
    padding: spacing.s,
  },

// After (Precise Snap-Scrolling & >= 48px touch target):
export const FeedScreen: React.FC<Props> = ({ navigation }) => {
  ...
  const flatListRef = useRef<FlatList>(null);
  const [containerHeight, setContainerHeight] = React.useState<number>(0);
  ...
  <View 
    style={styles.feedContainer}
    onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
  >
    {activePapers.length > 0 && containerHeight > 0 ? (
      <FlatList
        ref={flatListRef}
        data={activePapers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PaperCard paper={item} cardHeight={containerHeight} />}
        snapToInterval={containerHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        pagingEnabled={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
      />
    ) : ...}
  </View>
  ...
  menuButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
```

#### 2. `d:/Intern/ReOpSy/app/src/components/PaperCard.tsx`
```tsx
// Before (Lines 9-11, 73-78, 117-128):
const SCREEN_HEIGHT = Dimensions.get('window').height;
const HEADER_OFFSET = 120;
...
cardContainer: {
  height: SCREEN_HEIGHT - HEADER_OFFSET,
  backgroundColor: colors.bg,
  flexDirection: 'column',
  justifyContent: 'space-between',
},
linkRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  paddingVertical: spacing.s,
  marginTop: spacing.m,
},

// After (Pass dynamic cardHeight, clean flex layout, >= 48px linkRow):
interface Props {
  paper: Paper;
  cardHeight?: number;
}
export const PaperCard: React.FC<Props> = ({ paper, cardHeight }) => {
  ...
  return (
    <View style={[styles.cardContainer, cardHeight ? { height: cardHeight } : null]}>
      <View style={styles.content}>
        ...
        <TouchableOpacity 
          style={styles.linkRow} 
          onPress={handleOpenLink}
          activeOpacity={0.7}
        >
          <Feather name="external-link" size={16} color={colors.textDim} />
          <Text style={[styles.linkText, { marginLeft: spacing.s }]}>Credits & Paper Link</Text>
        </TouchableOpacity>
      </View>
      <ActionBar paper={paper} />
    </View>
  );
};
...
linkRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  minHeight: 48,
  paddingVertical: spacing.s,
},
```

#### 3. `d:/Intern/ReOpSy/app/src/components/TopicTabs.tsx`
```tsx
// Before (Lines 64-74):
pill: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: spacing.m,
  paddingVertical: spacing.s,
  borderRadius: 20,
  backgroundColor: colors.accent,
  marginRight: spacing.s,
  borderWidth: 1,
  borderColor: 'transparent',
},

// After (Touch target >= 48px):
pill: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: spacing.m,
  minHeight: 48,
  borderRadius: 24,
  backgroundColor: colors.accent,
  marginRight: spacing.s,
  borderWidth: 1,
  borderColor: 'transparent',
},
```

#### 4. `d:/Intern/ReOpSy/app/src/screens/SavedScreen.tsx`
```tsx
// Before (Lines 27-29, 48-57):
<TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
  <Feather name="arrow-left" size={24} color={colors.text} />
</TouchableOpacity>
...
<TouchableOpacity style={styles.linkBtn} onPress={() => handleOpenLink(item.url)}>
  <Text style={styles.linkText}>Read full paper ↗</Text>
</TouchableOpacity>
<TouchableOpacity onPress={() => handleUnsave(item)}>
  <Feather name="trash-2" size={20} color={colors.danger || '#ff4444'} />
</TouchableOpacity>

// After (Feather external-link icon, touch targets >= 48px):
<TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
  <Feather name="arrow-left" size={24} color={colors.text} />
</TouchableOpacity>
...
<TouchableOpacity style={styles.linkBtn} onPress={() => handleOpenLink(item.url)}>
  <Text style={styles.linkText}>Read full paper</Text>
  <Feather name="external-link" size={14} color={colors.primary} style={{ marginLeft: 6 }} />
</TouchableOpacity>
<TouchableOpacity style={styles.trashBtn} onPress={() => handleUnsave(item)}>
  <Feather name="trash-2" size={20} color={colors.danger} />
</TouchableOpacity>
...
backBtn: {
  minWidth: 48,
  minHeight: 48,
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: spacing.s,
},
linkBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: colors.accent,
  paddingHorizontal: spacing.m,
  minHeight: 48,
  borderRadius: 8,
},
trashBtn: {
  minWidth: 48,
  minHeight: 48,
  alignItems: 'center',
  justifyContent: 'center',
},
```

#### 5. `d:/Intern/ReOpSy/app/src/screens/PersonalizationScreen.tsx`
```tsx
// Before (Lines 14-16, 41-47, 73-78, 114-119):
<TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
  <Feather name="x" size={20} color={colors.text} />
</TouchableOpacity>
...
<TouchableOpacity 
  style={[styles.followBtn, isFollowing && styles.followingBtn]}
  onPress={() => toggleTopic(topic.slug)}
>
  <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
    {isFollowing ? '✓ Following' : '+ Follow'}
  </Text>
</TouchableOpacity>
...
closeBtn: {
  position: 'absolute',
  right: spacing.m,
  top: spacing.xl,
  padding: spacing.s,
},
followBtn: {
  paddingHorizontal: spacing.m,
  paddingVertical: spacing.s,
  borderRadius: 20,
  backgroundColor: colors.text,
},

// After (Feather check/plus icons, touch targets >= 48px):
<TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
  <Feather name="x" size={24} color={colors.text} />
</TouchableOpacity>
...
<TouchableOpacity 
  style={[styles.followBtn, isFollowing && styles.followingBtn]}
  onPress={() => toggleTopic(topic.slug)}
>
  <Feather 
    name={isFollowing ? "check" : "plus"} 
    size={16} 
    color={isFollowing ? colors.text : colors.bg} 
    style={{ marginRight: 6 }} 
  />
  <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
    {isFollowing ? 'Following' : 'Follow'}
  </Text>
</TouchableOpacity>
...
closeBtn: {
  position: 'absolute',
  right: spacing.m,
  top: spacing.xl,
  minWidth: 48,
  minHeight: 48,
  alignItems: 'center',
  justifyContent: 'center',
},
followBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: spacing.m,
  minHeight: 48,
  borderRadius: 24,
  backgroundColor: colors.text,
},
```

#### 6. `d:/Intern/ReOpSy/app/src/screens/SettingsScreen.tsx`
```tsx
// Key Fixes:
// 1. backButton: minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center'
// 2. providerChip: minHeight: 48, justifyContent: 'center'
// 3. buttonOutline: minHeight: 48, justifyContent: 'center'
// 4. actionRow: minHeight: 48
```

#### 7. `d:/Intern/ReOpSy/app/src/config.ts` & `d:/Intern/ReOpSy/app/src/types.ts`
```ts
// Remove all raw emoji properties from config.topics and types.ts.
// Rely purely on the `icon` property mapping to Feather icons.
```

#### 8. `d:/Intern/ReOpSy/app/tsconfig.test.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "testbuild",
    "rootDir": "src",
    "strict": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/logic/**/*.ts", "src/types.ts"]
}
```

---

## 5. Verification Method

To independently verify these findings and check future implementations:

1. **Verify TypeScript Health**:
   ```bash
   cd d:/Intern/ReOpSy/app
   npx tsc --noEmit
   ```
   *Expected Output*: Exit code `0` with 0 type errors.

2. **Verify Expo Web Export**:
   ```bash
   cd d:/Intern/ReOpSy/app
   npx expo export -p web
   ```
   *Expected Output*: Exit code `0`, `dist/` directory generated with static JS bundles.

3. **Verify Pure Logic Tests**:
   ```bash
   cd d:/Intern/ReOpSy/app
   npm test
   ```
   *Expected Output*: Tests run via Node test runner after updating `tsconfig.test.json`.

4. **Verify Touch Targets & UI in Code Review**:
   - Inspect all `TouchableOpacity` / `Pressable` styles across `FeedScreen.tsx`, `PaperCard.tsx`, `TopicTabs.tsx`, `SavedScreen.tsx`, `PersonalizationScreen.tsx`, and `SettingsScreen.tsx`.
   - Confirm every clickable element has bounding box `>= 48x48px`.
   - Confirm zero emoji literals remain in `config.ts`, `types.ts`, `SavedScreen.tsx`, and `PersonalizationScreen.tsx`.
