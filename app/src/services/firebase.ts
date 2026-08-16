import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

declare const process: {
  env?: Record<string, string | undefined>;
};

// Support both EXPO_PUBLIC_* env vars and direct config fallback
const env = (typeof process !== 'undefined' && process.env) ? process.env : {};

const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID || ""
};

/**
 * Checks whether valid Firebase credentials have been provided.
 * Returns false when running in unconfigured or offline mode.
 */
export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey.trim() !== "" &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId.trim() !== ""
  );
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured()) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    console.warn("[Firebase] Initialization error:", error);
    app = null;
    auth = null;
    db = null;
  }
}

export { app, auth, db, firebaseConfig };
