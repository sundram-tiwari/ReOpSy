import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Detected without importing react-native, so this module also compiles in
// the Node-only test build (tsconfig.test.json).
const isReactNative =
  typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative';

declare const process: {
  env: Record<string, string | undefined>;
};

const firebaseConfig = {
  apiKey: process.env?.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env?.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env?.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env?.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env?.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env?.EXPO_PUBLIC_FIREBASE_APP_ID || ""
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
    const fresh = getApps().length === 0;
    app = fresh ? initializeApp(firebaseConfig) : getApp();
    if (isReactNative && fresh) {
      // Keep users signed in across app restarts on Android/iOS. The
      // react-native build of firebase/auth exports getReactNativePersistence;
      // the default type declarations do not, hence the require.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getReactNativePersistence } = require('firebase/auth') as {
        getReactNativePersistence: (storage: unknown) => any;
      };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } else {
      auth = getAuth(app);
    }
    db = getFirestore(app);
  } catch (error) {
    console.warn("[Firebase] Initialization error:", error);
    app = null;
    auth = null;
    db = null;
  }
}

export { app, auth, db, firebaseConfig };
