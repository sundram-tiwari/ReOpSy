import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { canKeepVerifiedProfile, classifyProfileLoadError, ProfileLoadError } from '../logic/profileLoad';
import { isFirebaseConfigured } from '../services/firebase';
import { Author, Profile, getOwnProfile, hasUnread, listFollowing } from '../services/community';
import { useAppState } from './AppState';

interface CommunityContext {
  /** False in builds without Firebase: community screens explain and stay read-only. */
  enabled: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  profileLoadError: ProfileLoadError | null;
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
  const { state: { blockedUids } } = useAppState();
  const enabled = isFirebaseConfigured();
  const uid = user?.uid;
  const [profileCheck, setProfileCheck] = useState<{ uid: string; profile: Profile | null; error: ProfileLoadError | null } | null>(null);
  const pending = useRef<{ uid: string; request: symbol; work: Promise<void> } | null>(null);
  const ownCheck = profileCheck?.uid === uid ? profileCheck : null;
  const profile = ownCheck?.profile ?? null;
  const profileLoading = Boolean(uid && !ownCheck);
  const profileLoadError = ownCheck?.error ?? null;
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [inboxBadge, setInboxBadge] = useState<{ uid: string; unread: boolean } | null>(null);
  const unreadRequest = useRef(0);
  const unread = inboxBadge?.uid === user?.uid && Boolean(inboxBadge?.unread);

  const refreshProfile = useCallback((): Promise<void> => {
    if (!uid) {
      pending.current = null;
      setProfileCheck(null);
      return Promise.resolve();
    }
    if (pending.current?.uid === uid) return pending.current.work;
    // Keep a known existing profile during refresh, but never offer creation from stale absence.
    setProfileCheck((current) => current?.uid === uid && current.profile ? current : null);
    const request = Symbol();
    const work = (async () => {
      try {
        const current = await getOwnProfile(uid);
        if (pending.current?.request === request) setProfileCheck({ uid, profile: current, error: null });
      } catch (cause) {
        if (pending.current?.request === request) {
          const error = classifyProfileLoadError(cause);
          setProfileCheck((prior) => ({
            uid,
            profile: prior?.uid === uid && canKeepVerifiedProfile(error) ? prior.profile : null,
            error,
          }));
        }
      } finally {
        if (pending.current?.request === request) pending.current = null;
      }
    })();
    pending.current = { uid, request, work };
    return work;
  }, [uid]);

  const refreshFollowing = useCallback(async () => {
    if (!enabled || !user) return setFollowing(new Set());
    try {
      setFollowing(new Set(await listFollowing(user.uid)));
    } catch {
      // keep what we have
    }
  }, [enabled, user]);

  const refreshUnread = useCallback(async () => {
    const id = ++unreadRequest.current;
    if (!enabled || !user) {
      setInboxBadge(null);
      return;
    }
    const currentUser = user.uid;
    try {
      const visibleUnread = await hasUnread(currentUser, blockedUids);
      if (id === unreadRequest.current) setInboxBadge({ uid: currentUser, unread: visibleUnread });
    } catch {
      if (id === unreadRequest.current) setInboxBadge(null);
    }
  }, [enabled, user, blockedUids]);

  useEffect(() => {
    refreshProfile();
    refreshFollowing();
  }, [refreshProfile, refreshFollowing]);

  useEffect(() => {
    void refreshUnread();
    return () => { ++unreadRequest.current; };
  }, [refreshUnread]);

  const value = useMemo<CommunityContext>(
    () => ({
      enabled,
      profile,
      profileLoading,
      profileLoadError,
      me: profile && !profileLoadError ? { uid: profile.uid, name: profile.name, handle: profile.handle } : null,
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
    [enabled, profile, profileLoading, profileLoadError, following, unread, refreshProfile, refreshFollowing, refreshUnread],
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
