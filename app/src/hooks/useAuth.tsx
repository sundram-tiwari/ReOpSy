import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth, db, isFirebaseConfigured } from '../services/firebase';

declare const process: {
  env?: Record<string, string | undefined>;
};

export interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  adminLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  error: string | null;
  isConfigured: boolean;
  /** Google popup sign-in works in browsers only; native uses email. */
  googleAvailable: boolean;
  signInWithGoogle: () => Promise<User | null>;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Deletes the Firebase Auth account. Call after the user's data is removed. */
  deleteAuthAccount: () => Promise<string | null>;
  refreshAdminStatus?: () => Promise<void>;
}

const AuthContext = createContext<UseAuthReturn | null>(null);

/** Maps Firebase error codes to messages a person can act on. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks wrong.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Use a password of at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/requires-recent-login':
      return 'For your security, sign out and sign in again, then retry.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is not enabled for this project yet.';
    default:
      return (err as { message?: string })?.message || 'Something went wrong. Try again.';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  const verifyAdminStatus = useCallback(
    async (currentUser: User | null): Promise<void> => {
      if (!currentUser || !currentUser.email) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setAdminLoading(false);
        return;
      }
      const email = currentUser.email.trim().toLowerCase();
      const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
      if (superAdminEmail && email === superAdminEmail) {
        setIsAdmin(true);
        setIsSuperAdmin(true);
        setAdminLoading(false);
        return;
      }
      setIsSuperAdmin(false);
      setAdminLoading(true);
      try {
        if (!configured || !db) {
          setIsAdmin(false);
          return;
        }
        const adminSnap = await getDoc(doc(db, 'admins', email));
        setIsAdmin(adminSnap.exists());
      } catch {
        setIsAdmin(false);
      } finally {
        setAdminLoading(false);
      }
    },
    [configured],
  );

  useEffect(() => {
    if (!configured || !auth) {
      setLoading(false);
      return;
    }
    let mounted = true;
    if (Platform.OS === 'web') {
      getRedirectResult(auth).catch(() => {});
    }
    const unsubscribe = onAuthStateChanged(
      auth,
      (u) => {
        if (!mounted) return;
        setUser(u);
        setLoading(false);
        verifyAdminStatus(u);
      },
      () => mounted && setLoading(false),
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [configured, verifyAdminStatus]);

  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    if (!configured || !auth) return null;
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return null;
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr) {
          setError(authErrorMessage(redirectErr));
        }
        return null;
      }
      setError(authErrorMessage(err));
      return null;
    }
  }, [configured]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!configured || !auth) return 'Sign-in is not configured for this build.';
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        return null;
      } catch (err) {
        return authErrorMessage(err);
      }
    },
    [configured],
  );

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      if (!configured || !auth) return 'Sign-in is not configured for this build.';
      if (password.length < 8) return 'Use a password of at least 8 characters.';
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
        return null;
      } catch (err) {
        return authErrorMessage(err);
      }
    },
    [configured],
  );

  const resetPassword = useCallback(
    async (email: string) => {
      if (!configured || !auth) return 'Sign-in is not configured for this build.';
      try {
        await sendPasswordResetEmail(auth, email.trim());
        return null;
      } catch (err) {
        return authErrorMessage(err);
      }
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (configured && auth) {
      try {
        await firebaseSignOut(auth);
      } catch (err) {
        setError(authErrorMessage(err));
      }
    }
    setUser(null);
    setIsAdmin(false);
    setIsSuperAdmin(false);
  }, [configured]);

  const deleteAuthAccount = useCallback(async () => {
    if (!auth?.currentUser) return 'You are not signed in.';
    try {
      await deleteUser(auth.currentUser);
      return null;
    } catch (err) {
      return authErrorMessage(err);
    }
  }, []);

  const value = useMemo<UseAuthReturn>(
    () => ({
      user,
      loading,
      adminLoading,
      isAdmin,
      isSuperAdmin,
      error,
      isConfigured: configured,
      googleAvailable: configured && Platform.OS === 'web',
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      signOut,
      deleteAuthAccount,
      refreshAdminStatus: () => verifyAdminStatus(user),
    }),
    [user, loading, adminLoading, isAdmin, isSuperAdmin, error, configured, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, signOut, deleteAuthAccount, verifyAdminStatus],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): UseAuthReturn => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
