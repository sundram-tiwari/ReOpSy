import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paper, StreakState, UserApiConfig } from '../types';
import { initialStreak, recordActivity } from '../logic/streak';
import dailyFeedJson from '../data/dailyFeed.json';
import { useAuth } from '../hooks/useAuth';
import { db, isFirebaseConfigured } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { fetchCustomTopicPapers } from '../services/customTopicFetcher';
import { sanitizeLogMessage } from '../services/apiValidator';

export const STORAGE_KEY = 'reopsy_v2_state';
export type { UserApiConfig };

export interface StoredAppState {
  followedTopics: string[];
  savedPapers: Paper[];
  likedPapers: string[];
  streak: StreakState;
  onboardingComplete: boolean;
  userApiConfig: UserApiConfig | null;
  customFeedData?: Paper[];
}

export interface AppStateContext {
  followedTopics: string[];
  toggleTopic: (topic: string) => void;
  feedData: Record<string, Paper[]>;
  activeTopic: string;
  setActiveTopic: (topic: string) => void;
  savedPapers: Paper[];
  toggleSavePaper: (paper: Paper) => void;
  isSaved: (paperId: string) => boolean;
  likedPapers: Set<string>;
  toggleLikePaper: (paper: Paper) => void;
  isLiked: (paperId: string) => boolean;
  streak: StreakState;
  recordRead: () => void;
  onboardingComplete: boolean;
  completeOnboarding: () => void;
  clearCache: () => Promise<void>;
  userApiConfig: UserApiConfig | null;
  setUserApiConfig: (config: UserApiConfig | null) => void;
  clearUserApiConfig: () => void;
  customFeedData: Paper[];
  setCustomFeedData: (papers: Paper[]) => void;
  fetchCustomPapers: (topicQuery?: string) => Promise<{ success: boolean; count: number; error?: string; message?: string }>;
  isLoaded: boolean;
  isSyncing: boolean;
}

/**
 * Pure state merge function that combines local and remote cloud states without losing
 * offline progress, bookmarks, topic preferences, or API configurations.
 */
export function mergeCloudAndLocalState(
  local: StoredAppState,
  cloud?: Partial<StoredAppState> | null
): StoredAppState {
  if (!cloud) {
    return {
      ...local,
      followedTopics: local.followedTopics?.length ? local.followedTopics : ['ml', 'ai-health'],
      savedPapers: local.savedPapers || [],
      likedPapers: local.likedPapers || [],
      streak: local.streak || initialStreak,
      onboardingComplete: Boolean(local.onboardingComplete),
      userApiConfig: local.userApiConfig || null,
      customFeedData: local.customFeedData || []
    };
  }

  // 1. Followed topics: union of unique topics with fallback
  const cloudTopics = Array.isArray(cloud.followedTopics) ? cloud.followedTopics : [];
  const localTopics = Array.isArray(local.followedTopics) ? local.followedTopics : [];
  const topicSet = new Set<string>();
  const mergedTopics: string[] = [];

  for (const t of [...cloudTopics, ...localTopics]) {
    if (typeof t === 'string' && t.trim() !== '' && !topicSet.has(t)) {
      topicSet.add(t);
      mergedTopics.push(t);
    }
  }
  const finalTopics = mergedTopics.length > 0 ? mergedTopics : ['ml', 'ai-health'];

  // 2. Saved papers: union deduplicated by paper ID (local recents first)
  const localSaved = Array.isArray(local.savedPapers) ? local.savedPapers : [];
  const cloudSaved = Array.isArray(cloud.savedPapers) ? cloud.savedPapers : [];
  const seenPaperIds = new Set<string>();
  const mergedSaved: Paper[] = [];

  for (const paper of localSaved) {
    if (paper && paper.id && !seenPaperIds.has(paper.id)) {
      seenPaperIds.add(paper.id);
      mergedSaved.push(paper);
    }
  }
  for (const paper of cloudSaved) {
    if (paper && paper.id && !seenPaperIds.has(paper.id)) {
      seenPaperIds.add(paper.id);
      mergedSaved.push(paper);
    }
  }

  // 3. Liked papers: union of string IDs
  const localLiked = Array.isArray(local.likedPapers) ? local.likedPapers : [];
  const cloudLiked = Array.isArray(cloud.likedPapers) ? cloud.likedPapers : [];
  const mergedLiked = Array.from(
    new Set([...cloudLiked, ...localLiked].filter(id => typeof id === 'string' && id.trim() !== ''))
  );

  // 4. Streak state: preserve highest activity and latest active day
  const localStreak = local.streak || initialStreak;
  const cloudStreak = cloud.streak || initialStreak;

  let current = Math.max(localStreak.current || 0, cloudStreak.current || 0);
  let lastActiveDay = localStreak.lastActiveDay;

  if (!lastActiveDay && cloudStreak.lastActiveDay) {
    lastActiveDay = cloudStreak.lastActiveDay;
    current = cloudStreak.current || 0;
  } else if (lastActiveDay && cloudStreak.lastActiveDay) {
    if (cloudStreak.lastActiveDay > lastActiveDay) {
      lastActiveDay = cloudStreak.lastActiveDay;
      current = cloudStreak.current || 0;
    } else if (lastActiveDay > cloudStreak.lastActiveDay) {
      lastActiveDay = localStreak.lastActiveDay;
      current = localStreak.current || 0;
    } else {
      current = Math.max(localStreak.current || 0, cloudStreak.current || 0);
    }
  }

  const mergedStreak: StreakState = {
    current,
    longest: Math.max(localStreak.longest || 0, cloudStreak.longest || 0, current),
    lastActiveDay: lastActiveDay || null,
    freezes: Math.max(localStreak.freezes || 0, cloudStreak.freezes || 0),
    freezesEarned: Math.max(localStreak.freezesEarned || 0, cloudStreak.freezesEarned || 0),
    totalDays: Math.max(localStreak.totalDays || 0, cloudStreak.totalDays || 0)
  };

  // 5. User API Config: prioritize configured key
  let mergedApiConfig: UserApiConfig | null = null;
  if (local.userApiConfig && local.userApiConfig.apiKey && local.userApiConfig.apiKey.trim() !== '') {
    mergedApiConfig = {
      provider: local.userApiConfig.provider || cloud.userApiConfig?.provider || 'Gemini',
      apiKey: local.userApiConfig.apiKey,
      endpoint: local.userApiConfig.endpoint || cloud.userApiConfig?.endpoint || '',
      customTopic: local.userApiConfig.customTopic || cloud.userApiConfig?.customTopic || ''
    };
  } else if (cloud.userApiConfig && cloud.userApiConfig.apiKey && cloud.userApiConfig.apiKey.trim() !== '') {
    mergedApiConfig = {
      provider: cloud.userApiConfig.provider || 'Gemini',
      apiKey: cloud.userApiConfig.apiKey,
      endpoint: cloud.userApiConfig.endpoint || '',
      customTopic: cloud.userApiConfig.customTopic || ''
    };
  } else if (local.userApiConfig || cloud.userApiConfig) {
    mergedApiConfig = {
      provider: local.userApiConfig?.provider || cloud.userApiConfig?.provider || 'Gemini',
      apiKey: local.userApiConfig?.apiKey || cloud.userApiConfig?.apiKey || '',
      endpoint: local.userApiConfig?.endpoint || cloud.userApiConfig?.endpoint || '',
      customTopic: local.userApiConfig?.customTopic || cloud.userApiConfig?.customTopic || ''
    };
  }

  // 6. Onboarding status
  const mergedOnboarding = Boolean(local.onboardingComplete || cloud.onboardingComplete);

  // 7. Custom feed data
  const localCustom = Array.isArray(local.customFeedData) ? local.customFeedData : [];
  const cloudCustom = Array.isArray(cloud.customFeedData) ? cloud.customFeedData : [];
  const mergedCustomFeed = localCustom.length > 0 ? localCustom : cloudCustom;

  return {
    followedTopics: finalTopics,
    savedPapers: mergedSaved,
    likedPapers: mergedLiked,
    streak: mergedStreak,
    onboardingComplete: mergedOnboarding,
    userApiConfig: mergedApiConfig,
    customFeedData: mergedCustomFeed
  };
}

const AppContext = createContext<AppStateContext | null>(null);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [followedTopics, setFollowedTopics] = useState<string[]>(['ml', 'ai-health']);
  const [activeTopic, setActiveTopic] = useState<string>('ml');
  const [savedPapers, setSavedPapers] = useState<Paper[]>([]);
  const [likedPapers, setLikedPapers] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState<StreakState>(initialStreak);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(false);
  const [userApiConfig, setUserApiConfigState] = useState<UserApiConfig | null>(null);
  const [customFeedData, setCustomFeedDataState] = useState<Paper[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { user } = useAuth();
  const lastHydratedUidRef = useRef<string | null>(null);
  const isHydratingRef = useRef<boolean>(false);

  // Load feed from dailyFeed.json
  const feedData = dailyFeedJson.topics as Record<string, Paper[]>;

  // Phase 1: Load from local AsyncStorage on mount
  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((data) => {
        if (!isMounted) return;
        if (data) {
          try {
            const parsed = JSON.parse(data);
            const merged = mergeCloudAndLocalState({
              followedTopics: ['ml', 'ai-health'],
              savedPapers: [],
              likedPapers: [],
              streak: initialStreak,
              onboardingComplete: false,
              userApiConfig: null,
              customFeedData: []
            }, parsed);

            setFollowedTopics(merged.followedTopics);
            setSavedPapers(merged.savedPapers);
            setLikedPapers(new Set(merged.likedPapers));
            setStreak(merged.streak);
            setOnboardingComplete(merged.onboardingComplete);
            setUserApiConfigState(merged.userApiConfig);
            setCustomFeedDataState(merged.customFeedData || []);

            if (merged.followedTopics.length > 0) {
              setActiveTopic(merged.followedTopics[0]);
            }
          } catch (e) {
            console.warn("[AppState] Failed to parse local state from AsyncStorage", e);
          }
        }
        setIsLoaded(true);
      })
      .catch((e) => {
        console.warn("[AppState] Failed to load local state from AsyncStorage", e);
        if (isMounted) setIsLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Phase 2: Remote Hydration from Firestore on User Authentication
  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      if (lastHydratedUidRef.current !== null) {
        // User just logged out, clear local cache to prevent data leaking
        lastHydratedUidRef.current = null;
        setFollowedTopics(['ml', 'ai-health']);
        setActiveTopic('ml');
        setSavedPapers([]);
        setLikedPapers(new Set());
        setStreak(initialStreak);
        setOnboardingComplete(false);
        setUserApiConfigState(null);
        setCustomFeedDataState([]);
        AsyncStorage.removeItem(STORAGE_KEY).catch(err => console.warn(err));
      }
      return;
    }

    if (lastHydratedUidRef.current === user.uid) {
      return;
    }

    lastHydratedUidRef.current = user.uid;

    if (!isFirebaseConfigured() || !db) {
      return;
    }

    let isMounted = true;
    isHydratingRef.current = true;
    setIsSyncing(true);

    const userDocRef = doc(db, 'users', user.uid);

    getDoc(userDocRef)
      .then(async (docSnap) => {
        if (!isMounted) return;

        const currentLocalState: StoredAppState = {
          followedTopics,
          savedPapers,
          likedPapers: Array.from(likedPapers),
          streak,
          onboardingComplete,
          userApiConfig,
          customFeedData
        };

        if (docSnap.exists()) {
          const cloudData = docSnap.data() as Partial<StoredAppState>;
          const merged = mergeCloudAndLocalState(currentLocalState, cloudData);

          setFollowedTopics(merged.followedTopics);
          setSavedPapers(merged.savedPapers);
          setLikedPapers(new Set(merged.likedPapers));
          setStreak(merged.streak);
          setOnboardingComplete(merged.onboardingComplete);
          setUserApiConfigState(merged.userApiConfig);
          setCustomFeedDataState(merged.customFeedData || []);

          if (!merged.followedTopics.includes(activeTopic) && merged.followedTopics.length > 0) {
            setActiveTopic(merged.followedTopics[0]);
          }

          // Persist merged state locally and back to Firestore
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          await setDoc(userDocRef, merged, { merge: true });
        } else {
          // Initialize new cloud document with existing local state
          await setDoc(userDocRef, currentLocalState, { merge: true });
        }
      })
      .catch((err) => {
        console.warn("[AppState] Firestore hydration error:", err);
      })
      .finally(() => {
        if (isMounted) {
          isHydratingRef.current = false;
          setIsSyncing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user, isLoaded]);

  // Phase 3: Local-First Persistence & Background Firestore Sync
  useEffect(() => {
    if (!isLoaded || isHydratingRef.current) return;

    const stateToSave: StoredAppState = {
      followedTopics,
      savedPapers,
      likedPapers: Array.from(likedPapers),
      streak,
      onboardingComplete,
      userApiConfig,
      customFeedData
    };

    // Local-first write
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave)).catch((err) => {
      console.warn("[AppState] AsyncStorage write error:", err);
    });

    // Cloud sync when authenticated
    if (user && isFirebaseConfigured() && db) {
      setDoc(doc(db, 'users', user.uid), stateToSave, { merge: true }).catch((err) => {
        console.warn("[AppState] Firestore write error:", err);
      });
    }
  }, [
    followedTopics,
    savedPapers,
    likedPapers,
    streak,
    onboardingComplete,
    userApiConfig,
    customFeedData,
    isLoaded,
    user
  ]);

  const toggleTopic = useCallback((topic: string) => {
    setFollowedTopics((prev) => {
      if (prev.includes(topic)) {
        return prev.filter((t) => t !== topic);
      }
      return [...prev, topic];
    });
  }, []);

  const toggleSavePaper = useCallback((paper: Paper) => {
    setSavedPapers((prev) => {
      const exists = prev.find((p) => p.id === paper.id);
      if (exists) {
        return prev.filter((p) => p.id !== paper.id);
      }
      return [paper, ...prev];
    });
  }, []);

  const isSaved = useCallback((paperId: string) => {
    return savedPapers.some((p) => p.id === paperId);
  }, [savedPapers]);

  const toggleLikePaper = useCallback((paper: Paper) => {
    setLikedPapers((prev) => {
      const next = new Set(prev);
      if (next.has(paper.id)) {
        next.delete(paper.id);
      } else {
        next.add(paper.id);
      }
      return next;
    });
  }, []);

  const isLiked = useCallback((paperId: string) => {
    return likedPapers.has(paperId);
  }, [likedPapers]);

  const recordRead = useCallback(() => {
    setStreak((prev) => {
      const nextStreak = recordActivity(prev);
      return nextStreak.state;
    });
  }, []);

  const clearCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("[AppState] Error clearing AsyncStorage cache:", e);
    }

    setFollowedTopics(['ml', 'ai-health']);
    setActiveTopic('ml');
    setSavedPapers([]);
    setLikedPapers(new Set());
    setStreak(initialStreak);
    setOnboardingComplete(false);
    setUserApiConfigState(null);
    setCustomFeedDataState([]);

    if (user && isFirebaseConfigured() && db) {
      try {
        const emptyState: StoredAppState = {
          followedTopics: ['ml', 'ai-health'],
          savedPapers: [],
          likedPapers: [],
          streak: initialStreak,
          onboardingComplete: false,
          userApiConfig: null,
          customFeedData: []
        };
        await setDoc(doc(db, 'users', user.uid), emptyState);
      } catch (e) {
        console.warn("[AppState] Failed to reset Firestore state on clearCache:", e);
      }
    }
  }, [user]);

  const setUserApiConfig = useCallback((config: UserApiConfig | null) => {
    setUserApiConfigState(config);
  }, []);

  const clearUserApiConfig = useCallback(() => {
    setUserApiConfigState(null);
    setCustomFeedDataState([]);
  }, []);

  const setCustomFeedData = useCallback((papers: Paper[]) => {
    setCustomFeedDataState(papers);
  }, []);

  const fetchCustomPapers = useCallback(async (topicQuery?: string) => {
    const query = topicQuery?.trim() || userApiConfig?.customTopic?.trim() || '';
    if (!query) {
      return { success: false, count: 0, error: 'Please enter a research topic first.' };
    }

    try {
      const configToUse: UserApiConfig = userApiConfig || {
        provider: 'Gemini',
        apiKey: '',
        customTopic: query
      };

      const papers = await fetchCustomTopicPapers(query, configToUse, 5);
      setCustomFeedDataState(papers);

      if (userApiConfig) {
        setUserApiConfigState({
          ...userApiConfig,
          customTopic: query
        });
      }

      return {
        success: true,
        count: papers.length,
        message: `Successfully fetched ${papers.length} papers for "${query}".`
      };
    } catch (err: any) {
      const sanitized = sanitizeLogMessage(err?.message || 'Failed to fetch custom topic papers');
      return { success: false, count: 0, error: sanitized };
    }
  }, [userApiConfig]);

  if (!isLoaded) return null;

  return (
    <AppContext.Provider
      value={{
        followedTopics,
        toggleTopic,
        feedData,
        activeTopic,
        setActiveTopic,
        savedPapers,
        toggleSavePaper,
        isSaved,
        likedPapers,
        toggleLikePaper,
        isLiked,
        streak,
        recordRead,
        onboardingComplete,
        completeOnboarding: () => setOnboardingComplete(true),
        clearCache,
        userApiConfig,
        setUserApiConfig,
        clearUserApiConfig,
        customFeedData,
        setCustomFeedData,
        fetchCustomPapers,
        isLoaded,
        isSyncing
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppState = (): AppStateContext => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
