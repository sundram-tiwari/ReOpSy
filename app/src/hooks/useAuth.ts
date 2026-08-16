import { useState, useEffect, useCallback } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Alert } from 'react-native';
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
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  refreshAdminStatus?: () => Promise<void>;
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  const verifyAdminStatus = useCallback(async (currentUser: User | null): Promise<void> => {
    if (!currentUser || !currentUser.email) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminLoading(false);
      return;
    }

    const email = currentUser.email.trim().toLowerCase();
    const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
    const isSuper = Boolean(superAdminEmail && email === superAdminEmail);

    if (isSuper) {
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
        setAdminLoading(false);
        return;
      }

      const adminDocRef = doc(db, 'admins', email);
      const adminSnap = await getDoc(adminDocRef);
      setIsAdmin(adminSnap.exists());
    } catch (err: any) {
      console.warn('[useAuth] Firestore admin check error:', err);
      setIsAdmin(false);
    } finally {
      setAdminLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured || !auth) {
      setLoading(false);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminLoading(false);
      return;
    }

    let isMounted = true;

    // Check redirect result on web platforms if redirected back
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user && isMounted) {
          setUser(result.user);
          verifyAdminStatus(result.user);
        }
      })
      .catch((err: any) => {
        console.warn("[useAuth] getRedirectResult error:", err);
      });

    const unsubscribe = onAuthStateChanged(
      auth,
      (u) => {
        if (isMounted) {
          setUser(u);
          setLoading(false);
          verifyAdminStatus(u);
        }
      },
      (err) => {
        console.warn("[useAuth] onAuthStateChanged error:", err);
        if (isMounted) {
          setLoading(false);
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setAdminLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [configured, verifyAdminStatus]);

  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    if (!configured || !auth) {
      Alert.alert(
        "Sign In Unavailable",
        "Google Authentication requires Firebase configuration. You can continue using ReOpSy in offline local mode with full functionality."
      );
      return null;
    }

    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      // In web or popup-supporting environments, attempt popup first
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      await verifyAdminStatus(result.user);
      return result.user;
    } catch (err: any) {
      // If popup is blocked or unsupported in the current browser/webview context, fallback to redirect
      if (
        err?.code === 'auth/popup-blocked' ||
        err?.code === 'auth/operation-not-supported-in-this-environment' ||
        err?.code === 'auth/popup-closed-by-user'
      ) {
        if (err?.code === 'auth/popup-closed-by-user') {
          // User intentionally dismissed the popup, ignore quietly
          return null;
        }

        try {
          await signInWithRedirect(auth, provider);
          return null;
        } catch (redirectErr: any) {
          console.warn("[useAuth] signInWithRedirect error:", redirectErr);
          const message = redirectErr?.message || "Failed to sign in with Google redirect.";
          setError(message);
          Alert.alert("Sign In Error", message);
          return null;
        }
      }

      console.warn("[useAuth] signInWithPopup error:", err);
      const message = err?.message || "Failed to sign in with Google.";
      setError(message);
      Alert.alert("Sign In Error", message);
      return null;
    }
  }, [configured, verifyAdminStatus]);

  const signOut = useCallback(async (): Promise<void> => {
    if (!configured || !auth) {
      setUser(null);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminLoading(false);
      return;
    }

    try {
      await firebaseSignOut(auth);
      setUser(null);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setAdminLoading(false);
    } catch (err: any) {
      console.warn("[useAuth] signOut error:", err);
      const message = err?.message || "Failed to sign out.";
      setError(message);
      Alert.alert("Sign Out Error", message);
    }
  }, [configured]);

  const refreshAdminStatus = useCallback(async (): Promise<void> => {
    await verifyAdminStatus(user);
  }, [verifyAdminStatus, user]);

  return {
    user,
    loading,
    adminLoading,
    isAdmin,
    isSuperAdmin,
    error,
    isConfigured: configured,
    signInWithGoogle,
    signOut,
    refreshAdminStatus
  };
};
