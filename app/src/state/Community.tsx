import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isFirebaseConfigured } from '../services/firebase';
import { Author, Profile, getProfile, hasUnread, listFollowing } from '../services/community';

interface CommunityContext {
  /** False in builds without Firebase: community screens explain and stay read-only. */
  enabled: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  profileLoadFailed: boolean;
  me: Author | null;
  following: Set<string>;
  unread: boolean;
  refreshProfile: () => Promise<void>;
  refreshFollowing: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  setFollowingLocal: (uid: string, on: boolean) => void;
}

const Ctx = createContext<CommunityContext | null>(null);

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const enabled = isFirebaseConfigured();
  const [loadedProfile, setProfile] = useState<Profile | null>(null);
  const [profileCheck, setProfileCheck] = useState<{ uid: string; failed: boolean } | null>(null);
  const profileRequest = useRef(0);
  const profile = user?.uid === loadedProfile?.uid ? loadedProfile : null;
  const profileLoading = Boolean(user && profileCheck?.uid !== user.uid);
  const profileLoadFailed = Boolean(user && profileCheck?.uid === user.uid && profileCheck.failed);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(false);

  const refreshProfile = useCallback(async () => {
    const id = ++profileRequest.current;
    if (!enabled || !user) {
      setProfile(null);
      setProfileCheck(null);
      return;
    }
    setProfileCheck(null);
    try {
      const current = await getProfile(user.uid);
      if (id !== profileRequest.current) return;
      setProfile(current);
      setProfileCheck({ uid: user.uid, failed: false });
    } catch {
      if (id !== profileRequest.current) return;
      setProfileCheck({ uid: user.uid, failed: true });
    }
  }, [enabled, user]);

  const refreshFollowing = useCallback(async () => {
    if (!enabled || !user) return setFollowing(new Set());
    try {
      setFollowing(new Set(await listFollowing(user.uid)));
    } catch {
      // keep what we have
    }
  }, [enabled, user]);

  const refreshUnread = useCallback(async () => {
    if (!enabled || !user) return setUnread(false);
    try {
      setUnread(await hasUnread(user.uid));
    } catch {
      setUnread(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    refreshProfile();
    refreshFollowing();
    refreshUnread();
  }, [refreshProfile, refreshFollowing, refreshUnread]);

  const value = useMemo<CommunityContext>(
    () => ({
      enabled,
      profile,
      profileLoading,
      profileLoadFailed,
      me: profile ? { uid: profile.uid, name: profile.name, handle: profile.handle } : null,
      following,
      unread,
      refreshProfile,
      refreshFollowing,
      refreshUnread,
      setFollowingLocal: (uid, on) =>
        setFollowing((prev) => {
          const next = new Set(prev);
          if (on) next.add(uid);
          else next.delete(uid);
          return next;
        }),
    }),
    [enabled, profile, profileLoading, profileLoadFailed, following, unread, refreshProfile, refreshFollowing, refreshUnread],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommunity(): CommunityContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCommunity must be used within CommunityProvider');
  return ctx;
}

/**
 * Gate for contributing: returns the author when ready, otherwise sends the
 * user to sign in or to create a profile (which includes accepting the
 * community guidelines) and returns null.
 */
export function useContributor(navigate: (screen: 'SignIn' | 'EditProfile') => void) {
  const { user } = useAuth();
  const { me } = useCommunity();
  return useCallback((): Author | null => {
    if (!user) {
      navigate('SignIn');
      return null;
    }
    if (!me) {
      navigate('EditProfile');
      return null;
    }
    return me;
  }, [user, me, navigate]);
}
