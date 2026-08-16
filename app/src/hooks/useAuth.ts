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
import { Alert } from 'react-native';
import { auth, isFirebaseConfigured } from '../services/firebase';

export interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured || !auth) {
      setLoading(false);
      return;
    }

    // Check redirect result on web platforms if redirected back
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(result.user);
        }
      })
      .catch((err: any) => {
        console.warn("[useAuth] getRedirectResult error:", err);
      });

    const unsubscribe = onAuthStateChanged(
      auth,
      (u) => {
        setUser(u);
        setLoading(false);
      },
      (err) => {
        console.warn("[useAuth] onAuthStateChanged error:", err);
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [configured]);

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
  }, [configured]);

  const signOut = useCallback(async (): Promise<void> => {
    if (!configured || !auth) {
      setUser(null);
      return;
    }

    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (err: any) {
      console.warn("[useAuth] signOut error:", err);
      const message = err?.message || "Failed to sign out.";
      setError(message);
      Alert.alert("Sign Out Error", message);
    }
  }, [configured]);

  return {
    user,
    loading,
    error,
    isConfigured: configured,
    signInWithGoogle,
    signOut
  };
};
