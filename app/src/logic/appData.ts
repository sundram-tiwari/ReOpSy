import { LibraryEntry, Paper, RecallItem, StreakState, TriageRecord } from '../types';
import { initialStreak } from './streak';
import { daysBetween, isDayKey } from './date';

/**
 * The persisted app state (local first, optionally synced to users/{uid}).
 * Pure functions only, so migration and merge are unit-tested.
 */
export type ThemePrefValue = 'system' | 'light' | 'dark';

export interface StoredStateV3 {
  version: 3;
  followedTopics: string[];
  onboardingComplete: boolean;
  dailyGoal: number;
  triage: Record<string, TriageRecord>;
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

export function defaultState(): StoredStateV3 {
  return {
    version: 3,
    followedTopics: [...DEFAULT_TOPICS],
    onboardingComplete: false,
    dailyGoal: 10,
    triage: {},
    library: [],
    recallQueue: [],
    recallDays: [],
    recallSessions: 0,
    streak: { ...initialStreak },
    themePref: 'system',
    blockedUids: [],
    exportsCount: 0,
    postsCount: 0,
    surveyTitle: 'Literature survey',
    lastInboxSeenAt: 0,
    zotero: null,
  };
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);

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
      followedTopics: arr<string>(r.followedTopics).filter((t) => typeof t === 'string'),
      onboardingComplete: Boolean(r.onboardingComplete),
      dailyGoal: [5, 10, 15].includes(r.dailyGoal as number) ? (r.dailyGoal as number) : base.dailyGoal,
      triage: r.triage && typeof r.triage === 'object' ? (r.triage as Record<string, TriageRecord>) : {},
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
 * counters take the maximum; preferences follow the side that finished
 * onboarding.
 */
export function mergeStates(local: StoredStateV3, cloud: StoredStateV3): StoredStateV3 {
  const library = new Map<string, LibraryEntry>();
  for (const e of [...cloud.library, ...local.library]) library.set(e.paper.id, { ...(library.get(e.paper.id) || {}), ...e });

  const triage: Record<string, TriageRecord> = { ...cloud.triage };
  for (const [id, rec] of Object.entries(local.triage)) {
    const other = triage[id];
    if (!other || rec.day >= other.day) triage[id] = rec;
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
  };
}
