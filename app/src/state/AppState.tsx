import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paper, StreakState } from '../types';
import { initialStreak, recordActivity } from '../logic/streak';
import dailyFeedJson from '../data/dailyFeed.json';
import { useAuth } from '../hooks/useAuth';
import { db, isFirebaseConfigured } from '../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
interface AppStateContext {
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
  userApiConfig: { provider: string; apiKey: string; endpoint?: string; customTopic?: string } | null;
  setUserApiConfig: (config: { provider: string; apiKey: string; endpoint?: string; customTopic?: string } | null) => void;
  clearUserApiConfig: () => void;
}

const AppContext = createContext<AppStateContext | null>(null);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [followedTopics, setFollowedTopics] = useState<string[]>(['ml', 'ai-health']);
  const [activeTopic, setActiveTopic] = useState<string>('ml');
  const [savedPapers, setSavedPapers] = useState<Paper[]>([]);
  const [likedPapers, setLikedPapers] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState<StreakState>(initialStreak);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(false);
  const [userApiConfig, setUserApiConfig] = useState<{ provider: string; apiKey: string; endpoint?: string; customTopic?: string } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { user } = useAuth();

  // Load feed from JSON
  const feedData = dailyFeedJson.topics as Record<string, Paper[]>;

  useEffect(() => {
    AsyncStorage.getItem('reopsy_v2_state').then(data => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          setFollowedTopics(parsed.followedTopics || ['ml', 'ai-health']);
          setSavedPapers(parsed.savedPapers || []);
          setLikedPapers(new Set(parsed.likedPapers || []));
          setStreak(parsed.streak || initialStreak);
          setOnboardingComplete(parsed.onboardingComplete || false);
          setUserApiConfig(parsed.userApiConfig || null);
          
          if (parsed.followedTopics && parsed.followedTopics.length > 0) {
             setActiveTopic(parsed.followedTopics[0]);
          }
        } catch (e) {
          console.error("Failed to parse local state", e);
        }
      }
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const stateToSave = { 
        followedTopics, 
        savedPapers, 
        likedPapers: Array.from(likedPapers), 
        streak, 
        onboardingComplete,
        userApiConfig 
      };
      AsyncStorage.setItem('reopsy_v2_state', JSON.stringify(stateToSave));
      
      if (user && isFirebaseConfigured() && db) {
        setDoc(doc(db, 'users', user.uid), stateToSave, { merge: true }).catch(e => console.error("Failed to sync state to Firestore", e));
      }
    }
  }, [followedTopics, savedPapers, likedPapers, streak, onboardingComplete, userApiConfig, isLoaded, user]);

  const toggleTopic = (topic: string) => {
    setFollowedTopics(prev => {
      if (prev.includes(topic)) {
        return prev.filter(t => t !== topic);
      }
      return [...prev, topic];
    });
  };

  const toggleSavePaper = (paper: Paper) => {
    setSavedPapers(prev => {
      const exists = prev.find(p => p.id === paper.id);
      if (exists) {
        return prev.filter(p => p.id !== paper.id);
      }
      return [paper, ...prev];
    });
  };

  const isSaved = (paperId: string) => savedPapers.some(p => p.id === paperId);

  const toggleLikePaper = (paper: Paper) => {
    setLikedPapers(prev => {
      const next = new Set(prev);
      if (next.has(paper.id)) {
        next.delete(paper.id);
      } else {
        next.add(paper.id);
      }
      return next;
    });
  };

  const isLiked = (paperId: string) => likedPapers.has(paperId);

  const recordRead = () => {
    const nextStreak = recordActivity(streak);
    setStreak(nextStreak.state);
  };

  const clearCache = async () => {
    await AsyncStorage.removeItem('reopsy_v2_state');
    setFollowedTopics(['ml', 'ai-health']);
    setSavedPapers([]);
    setLikedPapers(new Set());
    setStreak(initialStreak);
    setOnboardingComplete(false);
  };

  if (!isLoaded) return null;

  return (
    <AppContext.Provider value={{ 
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
      clearUserApiConfig: () => setUserApiConfig(null)
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppState = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
