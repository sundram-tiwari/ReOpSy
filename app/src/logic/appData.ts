import { LibraryEntry, Paper, RecallItem, StreakState, TriageRecord } from '../types';
import { initialStreak } from './streak';
import { daysBetween, isDayKey } from './date';

/**
 * The persisted app state (local first, optionally synced to users/{uid}).
 * Pure functions only, so migration and merge are unit-tested.
 */
export type ThemePrefValue = 'system' | 'light' | 'dark';
type PaperLike = { liked: boolean; updatedAt: number };
const READING_PREFERENCE_KEYS = ['followedTopics', 'themePref', 'surveyTitle'] as const;
type ReadingPreferenceKey = typeof READING_PREFERENCE_KEYS[number];
type ReadingPreferenceUpdates = Partial<Record<ReadingPreferenceKey, number>>;

export interface StoredStateV3 {
  version: 3;
  followedTopics: string[];
  onboardingComplete: boolean;
  dailyGoal: number;
  triage: Record<string, TriageRecord>;
  paperLikes: Record<string, PaperLike>;
  library: LibraryEntry[];
  recallQueue: RecallItem[];
  recallDays: string[];
  recallSessions: number;
  streak: StreakState;
  themePref: ThemePrefValue;
  blockedUids: string[];
  exportsCount: number;
  postsCount: number;
  surveyTitle: string;
  readingPreferenceUpdatedAt: ReadingPreferenceUpdates;
  lastInboxSeenAt: number;
  zotero: { userId: string; username: string } | null;
}

export const DEFAULT_TOPICS = [
  'ai-mental-health',
  'autism-diagnosis',
  'blockchain',
  'quantum-communication',
  'surveillance-anomaly-detection',
];

const DEFAULT_SURVEY_TITLE = 'Literature survey';

export function defaultState(): StoredStateV3 {
  return {
    version: 3,
    followedTopics: [...DEFAULT_TOPICS],
    onboardingComplete: false,
    dailyGoal: 10,
    triage: {},
    paperLikes: {},
    library: [],
    recallQueue: [],
    recallDays: [],
    recallSessions: 0,
    streak: { ...initialStreak },
    themePref: 'system',
    blockedUids: [],
    exportsCount: 0,
    postsCount: 0,
    surveyTitle: DEFAULT_SURVEY_TITLE,
    readingPreferenceUpdatedAt: {},
    lastInboxSeenAt: 0,
    zotero: null,
  };
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);

function readPaperLikes(raw: unknown): StoredStateV3['paperLikes'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).flatMap(([id, value]) => {
    if (!id || !value || typeof value !== 'object') return [];
    const { liked, updatedAt } = value as Partial<PaperLike>;
    return typeof liked === 'boolean' && typeof updatedAt === 'number' && Number.isFinite(updatedAt) && updatedAt >= 0
      ? [[id, { liked, updatedAt }]]
      : [];
  }));
}

export function withPaperLike(state: StoredStateV3, id: string, liked: boolean, now: number): StoredStateV3 {
  const before = state.paperLikes[id];
  if (!id || (before?.liked === true) === liked) return state;
  return {
    ...state,
    paperLikes: { ...state.paperLikes, [id]: { liked, updatedAt: Math.max(now, (before?.updatedAt ?? -1) + 1) } },
  };
}

function readReadingPreferenceUpdates(raw: unknown): ReadingPreferenceUpdates {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  return Object.fromEntries(READING_PREFERENCE_KEYS.flatMap((key) => {
    const stamp = value[key];
    return typeof stamp === 'number' && Number.isSafeInteger(stamp) && stamp > 0 ? [[key, stamp]] : [];
  }));
}

/** Mark the field the person actually chose, including a choice of its default. */
export function withReadingPreference<K extends ReadingPreferenceKey>(
  state: StoredStateV3,
  key: K,
  value: StoredStateV3[K],
  now: number,
): StoredStateV3 {
  const previous = state.readingPreferenceUpdatedAt[key] ?? 0;
  const updatedAt = Math.max(Number.isSafeInteger(now) ? now : 0, previous + 1);
  return {
    ...state,
    [key]: value,
    readingPreferenceUpdatedAt: { ...state.readingPreferenceUpdatedAt, [key]: updatedAt },
  };
}

function meaningfulLegacyPreference(state: StoredStateV3, key: ReadingPreferenceKey): boolean {
  if (key === 'themePref') return state.themePref !== 'system';
  if (key === 'surveyTitle') return state.surveyTitle !== DEFAULT_SURVEY_TITLE;
  const followed = new Set(state.followedTopics);
  return followed.size !== DEFAULT_TOPICS.length || DEFAULT_TOPICS.some((topic) => !followed.has(topic));
}

function mergeReadingPreferences(local: StoredStateV3, cloud: StoredStateV3) {
  const pick = (key: ReadingPreferenceKey): StoredStateV3 => {
    const localAt = local.readingPreferenceUpdatedAt[key] ?? 0;
    const cloudAt = cloud.readingPreferenceUpdatedAt[key] ?? 0;
    if (localAt || cloudAt) return localAt > cloudAt ? local : cloud;
    // There is no trustworthy timing for older data. Preserve a meaningful
    // selection over an untouched default; use the existing account on ties.
    const localChanged = meaningfulLegacyPreference(local, key);
    const cloudChanged = meaningfulLegacyPreference(cloud, key);
    return localChanged && !cloudChanged ? local : cloud;
  };

  const followed = pick('followedTopics');
  const theme = pick('themePref');
  const survey = pick('surveyTitle');
  const readingPreferenceUpdatedAt = readReadingPreferenceUpdates({
    followedTopics: followed.readingPreferenceUpdatedAt.followedTopics,
    themePref: theme.readingPreferenceUpdatedAt.themePref,
    surveyTitle: survey.readingPreferenceUpdatedAt.surveyTitle,
  });
  return {
    followedTopics: followed.followedTopics,
    themePref: theme.themePref,
    surveyTitle: survey.surveyTitle,
    readingPreferenceUpdatedAt,
  };
}

function isPaper(p: unknown): p is Paper {
  return Boolean(p && typeof p === 'object' && typeof (p as Paper).id === 'string' && typeof (p as Paper).originalTitle === 'string');
}

/** Accepts anything previously stored (v2 or v3) and returns a valid v3 state. */
export function migrate(raw: unknown, today: string): StoredStateV3 {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;

  if (r.version === 3) {
    return {
      ...base,
      followedTopics: Array.isArray(r.followedTopics)
        ? r.followedTopics.filter((t): t is string => typeof t === 'string')
        : base.followedTopics,
      onboardingComplete: Boolean(r.onboardingComplete),
      dailyGoal: [5, 10, 15].includes(r.dailyGoal as number) ? (r.dailyGoal as number) : base.dailyGoal,
      triage: r.triage && typeof r.triage === 'object' ? (r.triage as Record<string, TriageRecord>) : {},
      paperLikes: readPaperLikes(r.paperLikes),
      library: arr<LibraryEntry>(r.library).filter((e) => e && isPaper(e.paper)),
      recallQueue: arr<RecallItem>(r.recallQueue).filter((q) => q && typeof q.paperId === 'string' && isDayKey(q.dueOn)),
      recallDays: arr<string>(r.recallDays).filter(isDayKey),
      recallSessions: num(r.recallSessions, 0),
      streak: { ...initialStreak, ...((r.streak as StreakState) || {}) },
      themePref: (['system', 'light', 'dark'] as const).includes(r.themePref as ThemePrefValue) ? (r.themePref as ThemePrefValue) : 'system',
      blockedUids: arr<string>(r.blockedUids).filter((u) => typeof u === 'string'),
      exportsCount: num(r.exportsCount, 0),
      postsCount: num(r.postsCount, 0),
      surveyTitle: str(r.surveyTitle, base.surveyTitle),
      readingPreferenceUpdatedAt: readReadingPreferenceUpdates(r.readingPreferenceUpdatedAt),
      lastInboxSeenAt: num(r.lastInboxSeenAt, 0),
      zotero: r.zotero && typeof r.zotero === 'object' ? (r.zotero as StoredStateV3['zotero']) : null,
    };
  }

  // v2 shape: { followedTopics, savedPapers, likedPapers, streak, onboardingComplete, userApiConfig, customFeedData }
  const saved = arr<Paper>(r.savedPapers).filter(isPaper);
  const followed = arr<string>(r.followedTopics).filter((t) => typeof t === 'string' && t !== 'global' && t !== 'custom');
  return {
    ...base,
    followedTopics: followed.length ? followed : base.followedTopics,
    onboardingComplete: Boolean(r.onboardingComplete),
    paperLikes: Object.fromEntries(arr<unknown>(r.likedPapers)
      .filter((id): id is string => typeof id === 'string' && !!id)
      .map((id) => [id, { liked: true, updatedAt: 0 }])),
    library: saved.map((paper) => ({ paper, status: 'saved' as const, addedOn: today })),
    triage: Object.fromEntries(saved.map((p) => [p.id, { action: 'saved' as const, day: today }])),
    streak: { ...initialStreak, ...((r.streak as StreakState) || {}) },
  };
}

/** Drops decisions older than `keepDays` so the synced document stays small. */
export function pruneTriage(triage: Record<string, TriageRecord>, today: string, keepDays = 120) {
  const out: Record<string, TriageRecord> = {};
  for (const [id, rec] of Object.entries(triage)) {
    if (rec && isDayKey(rec.day) && daysBetween(rec.day, today) <= keepDays) out[id] = rec;
  }
  return out;
}

function laterDay(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Merges the cloud copy into the local copy on sign-in. Nothing the user
 * collected on either side is lost: library, decisions and recall are unions;
 * counters take the maximum; reading preferences use per-field choice times.
 */
export function mergeStates(local: StoredStateV3, cloud: StoredStateV3): StoredStateV3 {
  const library = new Map<string, LibraryEntry>();
  for (const e of [...cloud.library, ...local.library]) library.set(e.paper.id, { ...(library.get(e.paper.id) || {}), ...e });

  const triage: Record<string, TriageRecord> = { ...cloud.triage };
  for (const [id, rec] of Object.entries(local.triage)) {
    const other = triage[id];
    if (!other || rec.day >= other.day) triage[id] = rec;
  }

  // Include unlikes so an older device does not restore a removed Like.
  const paperLikes = new Map(Object.entries(cloud.paperLikes));
  for (const [id, rec] of Object.entries(local.paperLikes)) {
    const other = paperLikes.get(id);
    if (!other || rec.updatedAt > other.updatedAt || (rec.updatedAt === other.updatedAt && !rec.liked)) {
      paperLikes.set(id, rec);
    }
  }

  const recall = new Map<string, RecallItem>();
  for (const q of [...cloud.recallQueue, ...local.recallQueue]) {
    const prev = recall.get(q.paperId);
    if (!prev || q.box > prev.box || (q.box === prev.box && q.dueOn > prev.dueOn)) recall.set(q.paperId, q);
  }

  const prefsFrom = local.onboardingComplete || !cloud.onboardingComplete ? local : cloud;
  const lastActive = laterDay(local.streak.lastActiveDay, cloud.streak.lastActiveDay);
  const streakFrom = lastActive === local.streak.lastActiveDay ? local.streak : cloud.streak;

  return {
    ...prefsFrom,
    version: 3,
    onboardingComplete: local.onboardingComplete || cloud.onboardingComplete,
    triage,
    paperLikes: Object.fromEntries(paperLikes),
    library: [...library.values()],
    recallQueue: [...recall.values()],
    recallDays: [...new Set([...cloud.recallDays, ...local.recallDays])].sort(),
    recallSessions: Math.max(local.recallSessions, cloud.recallSessions),
    streak: {
      ...streakFrom,
      longest: Math.max(local.streak.longest, cloud.streak.longest, streakFrom.current),
      totalDays: Math.max(local.streak.totalDays, cloud.streak.totalDays),
      freezesEarned: Math.max(local.streak.freezesEarned, cloud.streak.freezesEarned),
    },
    blockedUids: [...new Set([...cloud.blockedUids, ...local.blockedUids])],
    exportsCount: Math.max(local.exportsCount, cloud.exportsCount),
    postsCount: Math.max(local.postsCount, cloud.postsCount),
    lastInboxSeenAt: Math.max(local.lastInboxSeenAt, cloud.lastInboxSeenAt),
    zotero: local.zotero || cloud.zotero,
    ...mergeReadingPreferences(local, cloud),
  };
}
