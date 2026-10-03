import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isFirebaseConfigured } from '../services/firebase';
import { Author, Profile, getProfile, hasUnread, listFollowing } from '../services/community';

interface CommunityContext {
  /** False in builds without Firebase: community screens explain and stay read-only. */
  enabled: boolean;
  profile: Profile | null;
  profileLoading: boolean;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!enabled || !user) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    try {
      setProfile(await getProfile(user.uid));
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
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
    [enabled, profile, profileLoading, following, unread, refreshProfile, refreshFollowing, refreshUnread],
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
