import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  LibraryEntry,
  LibraryStatus,
  MatrixRow,
  NotRelevantReason,
  Paper,
  RecallGrade,
  TriageAction,
} from '../types';
import { recordActivity } from '../logic/streak';
import { dayKey } from '../logic/date';
import { StoredStateV3, ThemePrefValue, defaultState, mergeStates, migrate, pruneTriage } from '../logic/appData';
import { buildDailyDeck, DeckCard } from '../logic/triage';
import { gradeItem, scheduleNew } from '../logic/recall';
import { prepareFeed } from '../logic/feed';
import { topicTerms } from '../config';
import { useAuth } from '../hooks/useAuth';
import { db, isFirebaseConfigured } from '../services/firebase';
import { fetchLiveFeed } from '../services/feedService';
import { ThemePrefContext } from '../ui/theme';
import dailyFeedJson from '../data/dailyFeed.json';
import v2SamplesJson from '../data/v2Samples.json';

export const STORAGE_KEY = 'reopsy_v3_state';
const LEGACY_KEY = 'reopsy_v2_state';

interface UndoSnapshot {
  paperId: string;
  triage: StoredStateV3['triage'][string] | undefined;
  entry: LibraryEntry | undefined;
}

export interface AppStateContext {
  isLoaded: boolean;
  today: string;
  state: StoredStateV3;
  feed: Record<string, Paper[]>;
  deck: DeckCard[];
  findPaper: (id: string) => Paper | undefined;
  libraryEntry: (id: string) => LibraryEntry | undefined;

  triagePaper: (paper: Paper, action: TriageAction, reason?: NotRelevantReason) => void;
  /** Swiping past a card counts as "seen", unless you already decided on it today. */
  markSeen: (paper: Paper) => void;
  undoLastTriage: () => void;
  setLibraryStatus: (paper: Paper, status: LibraryStatus | null) => void;
  updateEntry: (paperId: string, patch: { note?: string; matrix?: MatrixRow }) => void;
  gradeRecall: (paperId: string, grade: RecallGrade) => void;
  finishRecallSession: () => void;

  toggleTopic: (slug: string) => void;
  setDailyGoal: (goal: number) => void;
  completeOnboarding: () => void;
  setThemePref: (pref: ThemePrefValue) => void;
  setSurveyTitle: (title: string) => void;
  blockUser: (uid: string) => void;
  unblockUser: (uid: string) => void;
  markInboxSeen: () => void;
  noteExport: () => void;
  notePost: () => void;
  setZotero: (z: StoredStateV3['zotero']) => void;
  resetLocalData: () => Promise<void>;
}

const AppContext = createContext<AppStateContext | null>(null);

const staticFeed = ((dailyFeedJson as { topics?: Record<string, Paper[]> }).topics || {}) as Record<string, Paper[]>;
const curatedFeed = ((v2SamplesJson as { topics?: Record<string, Paper[]> }).topics || {}) as Record<string, Paper[]>;

/** Firestore rejects `undefined` values; JSON round-trip strips them. */
function toFirestore(state: StoredStateV3, today: string): StoredStateV3 {
  return JSON.parse(JSON.stringify({ ...state, triage: pruneTriage(state.triage, today) }));
}

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [state, setState] = useState<StoredStateV3>(defaultState);
  const [today, setToday] = useState(dayKey());
  const [liveFeed, setLiveFeed] = useState<Record<string, Paper[]> | null>(null);
  const undoRef = useRef<UndoSnapshot | null>(null);
  const hydratedUid = useRef<string | null>(null);
  const hydrating = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The day rolls over while the app stays open in the background.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(dayKey());
    });
    return () => sub.remove();
  }, []);

  // 1. Local load (with migration from the v2 key).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = (await AsyncStorage.getItem(STORAGE_KEY)) ?? (await AsyncStorage.getItem(LEGACY_KEY));
        if (alive && raw) setState(migrate(JSON.parse(raw), dayKey()));
      } catch {
        // Corrupt storage: start fresh rather than crash.
      } finally {
        if (alive) setIsLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2. Live feed from Firestore when configured; bundled feed otherwise.
  useEffect(() => {
    let alive = true;
    fetchLiveFeed()
      .then((live) => alive && live && setLiveFeed(live.topics))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 3. Cloud hydration on sign-in; local data is cleared on sign-out.
  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      if (hydratedUid.current) {
        hydratedUid.current = null;
        setState(defaultState());
        AsyncStorage.multiRemove([STORAGE_KEY, LEGACY_KEY]).catch(() => {});
      }
      return;
    }
    if (hydratedUid.current === user.uid || !isFirebaseConfigured() || !db) return;
    hydratedUid.current = user.uid;
    hydrating.current = true;
    const ref = doc(db, 'users', user.uid);
    getDoc(ref)
      .then((snap) => {
        setState((local) => {
          const merged = snap.exists() ? mergeStates(local, migrate(snap.data(), dayKey())) : local;
          setDoc(ref, toFirestore(merged, dayKey())).catch(() => {});
          return merged;
        });
      })
      .catch(() => {})
      .finally(() => {
        hydrating.current = false;
      });
  }, [user, isLoaded]);

  // 4. Persist locally on every change; sync to the cloud, debounced.
  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    if (!user || !db || hydrating.current) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    const uid = user.uid;
    syncTimer.current = setTimeout(() => {
      if (db) setDoc(doc(db, 'users', uid), toFirestore(state, dayKey())).catch(() => {});
    }, 1500);
  }, [state, isLoaded, user]);

  const feed = useMemo(
    () => prepareFeed(liveFeed || staticFeed, curatedFeed, topicTerms(), new Date().getFullYear()),
    [liveFeed],
  );

  const paperIndex = useMemo(() => {
    const m = new Map<string, Paper>();
    for (const list of Object.values(feed)) for (const p of list) m.set(p.id, p);
    for (const e of state.library) if (!m.has(e.paper.id)) m.set(e.paper.id, e.paper);
    return m;
  }, [feed, state.library]);

  const deck = useMemo(
    () =>
      buildDailyDeck({
        papersByTopic: feed,
        followed: state.followedTopics,
        triage: state.triage,
        goal: state.dailyGoal,
        day: today,
      }),
    // The deck must not reshuffle as the user triages: it depends on today's
    // decisions only through availability, which buildDailyDeck keeps stable.
    [feed, state.followedTopics, state.dailyGoal, today, state.triage],
  );

  const update = useCallback((fn: (s: StoredStateV3) => StoredStateV3) => setState((s) => fn(s)), []);

  const triagePaper = useCallback(
    (paper: Paper, action: TriageAction, reason?: NotRelevantReason) => {
      update((s) => {
        const existing = s.library.find((e) => e.paper.id === paper.id);
        undoRef.current = { paperId: paper.id, triage: s.triage[paper.id], entry: existing };
        const triage = { ...s.triage, [paper.id]: reason ? { action, day: today, reason } : { action, day: today } };
        let library = s.library;
        if (action === 'saved' || action === 'later' || action === 'survey') {
          const entry: LibraryEntry = existing
            ? { ...existing, status: action === 'saved' ? 'saved' : action }
            : { paper, status: action === 'saved' ? 'saved' : action, addedOn: today };
          library = [entry, ...s.library.filter((e) => e.paper.id !== paper.id)];
        }
        let recallQueue = s.recallQueue;
        if ((action === 'saved' || action === 'survey') && !s.recallQueue.some((q) => q.paperId === paper.id)) {
          recallQueue = [...s.recallQueue, scheduleNew(paper.id, today)];
        }
        return { ...s, triage, library, recallQueue, streak: recordActivity(s.streak, today).state };
      });
    },
    [today, update],
  );

  const markSeen = useCallback(
    (paper: Paper) => {
      update((s) => {
        if (s.triage[paper.id]) return s;
        return {
          ...s,
          triage: { ...s.triage, [paper.id]: { action: 'seen', day: today } },
          streak: recordActivity(s.streak, today).state,
        };
      });
    },
    [today, update],
  );

  const undoLastTriage = useCallback(() => {
    const snap = undoRef.current;
    if (!snap) return;
    undoRef.current = null;
    update((s) => {
      const triage = { ...s.triage };
      if (snap.triage) triage[snap.paperId] = snap.triage;
      else delete triage[snap.paperId];
      const others = s.library.filter((e) => e.paper.id !== snap.paperId);
      const library = snap.entry ? [snap.entry, ...others] : others;
      const recallQueue = snap.entry ? s.recallQueue : s.recallQueue.filter((q) => q.paperId !== snap.paperId);
      return { ...s, triage, library, recallQueue };
    });
  }, [update]);

  const setLibraryStatus = useCallback(
    (paper: Paper, status: LibraryStatus | null) => {
      update((s) => {
        const others = s.library.filter((e) => e.paper.id !== paper.id);
        if (!status) return { ...s, library: others, recallQueue: s.recallQueue.filter((q) => q.paperId !== paper.id) };
        const existing = s.library.find((e) => e.paper.id === paper.id);
        const entry: LibraryEntry = existing ? { ...existing, status } : { paper, status, addedOn: today };
        const recallQueue =
          status !== 'later' && !s.recallQueue.some((q) => q.paperId === paper.id)
            ? [...s.recallQueue, scheduleNew(paper.id, today)]
            : s.recallQueue;
        return { ...s, library: [entry, ...others], recallQueue };
      });
    },
    [today, update],
  );

  const updateEntry = useCallback(
    (paperId: string, patch: { note?: string; matrix?: MatrixRow }) => {
      update((s) => ({
        ...s,
        library: s.library.map((e) => (e.paper.id === paperId ? { ...e, ...patch } : e)),
      }));
    },
    [update],
  );

  const gradeRecall = useCallback(
    (paperId: string, grade: RecallGrade) => {
      update((s) => ({
        ...s,
        recallQueue: s.recallQueue.map((q) => (q.paperId === paperId ? gradeItem(q, grade, today) : q)),
      }));
    },
    [today, update],
  );

  const finishRecallSession = useCallback(() => {
    update((s) => ({
      ...s,
      recallSessions: s.recallSessions + 1,
      recallDays: s.recallDays.includes(today) ? s.recallDays : [...s.recallDays, today],
      streak: recordActivity(s.streak, today).state,
    }));
  }, [today, update]);

  const value = useMemo<AppStateContext>(
    () => ({
      isLoaded,
      today,
      state,
      feed,
      deck,
      findPaper: (id) => paperIndex.get(id),
      libraryEntry: (id) => state.library.find((e) => e.paper.id === id),
      triagePaper,
      markSeen,
      undoLastTriage,
      setLibraryStatus,
      updateEntry,
      gradeRecall,
      finishRecallSession,
      toggleTopic: (slug) =>
        update((s) => ({
          ...s,
          followedTopics: s.followedTopics.includes(slug)
            ? s.followedTopics.filter((t) => t !== slug)
            : [...s.followedTopics, slug],
        })),
      setDailyGoal: (goal) => update((s) => ({ ...s, dailyGoal: goal })),
      completeOnboarding: () => update((s) => ({ ...s, onboardingComplete: true })),
      setThemePref: (themePref) => update((s) => ({ ...s, themePref })),
      setSurveyTitle: (surveyTitle) => update((s) => ({ ...s, surveyTitle })),
      blockUser: (uid) => update((s) => ({ ...s, blockedUids: [...new Set([...s.blockedUids, uid])] })),
      unblockUser: (uid) => update((s) => ({ ...s, blockedUids: s.blockedUids.filter((u) => u !== uid) })),
      markInboxSeen: () => update((s) => ({ ...s, lastInboxSeenAt: Date.now() })),
      noteExport: () => update((s) => ({ ...s, exportsCount: s.exportsCount + 1 })),
      notePost: () => update((s) => ({ ...s, postsCount: s.postsCount + 1 })),
      setZotero: (zotero) => update((s) => ({ ...s, zotero })),
      resetLocalData: async () => {
        await AsyncStorage.multiRemove([STORAGE_KEY, LEGACY_KEY]).catch(() => {});
        setState(defaultState());
      },
    }),
    [isLoaded, today, state, feed, deck, paperIndex, triagePaper, markSeen, undoLastTriage, setLibraryStatus, updateEntry, gradeRecall, finishRecallSession, update],
  );

  if (!isLoaded) return null;

  return (
    <AppContext.Provider value={value}>
      <ThemePrefContext.Provider value={state.themePref}>{children}</ThemePrefContext.Provider>
    </AppContext.Provider>
  );
};

export const useAppState = (): AppStateContext => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
