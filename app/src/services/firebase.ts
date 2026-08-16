import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Fill in firebaseConfig with your project's config from Firebase Console
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const isFirebaseConfigured = () => {
  return firebaseConfig.apiKey !== "";
};

const app = isFirebaseConfigured() && !getApps().length ? initializeApp(firebaseConfig) : (getApps().length ? getApps()[0] : null);
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

export { app, auth, db };
