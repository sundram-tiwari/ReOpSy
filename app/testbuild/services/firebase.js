"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firebaseConfig = exports.db = exports.auth = exports.app = exports.isFirebaseConfigured = void 0;
const app_1 = require("firebase/app");
const auth_1 = require("firebase/auth");
const firestore_1 = require("firebase/firestore");
const firebaseConfig = {
    apiKey: process.env?.EXPO_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env?.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env?.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env?.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env?.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env?.EXPO_PUBLIC_FIREBASE_APP_ID || ""
};
exports.firebaseConfig = firebaseConfig;
/**
 * Checks whether valid Firebase credentials have been provided.
 * Returns false when running in unconfigured or offline mode.
 */
const isFirebaseConfigured = () => {
    return Boolean(firebaseConfig.apiKey &&
        firebaseConfig.apiKey.trim() !== "" &&
        firebaseConfig.projectId &&
        firebaseConfig.projectId.trim() !== "");
};
exports.isFirebaseConfigured = isFirebaseConfigured;
let app = null;
exports.app = app;
let auth = null;
exports.auth = auth;
let db = null;
exports.db = db;
if ((0, exports.isFirebaseConfigured)()) {
    try {
        exports.app = app = (0, app_1.getApps)().length > 0 ? (0, app_1.getApp)() : (0, app_1.initializeApp)(firebaseConfig);
        exports.auth = auth = (0, auth_1.getAuth)(app);
        exports.db = db = (0, firestore_1.getFirestore)(app);
    }
    catch (error) {
        console.warn("[Firebase] Initialization error:", error);
        exports.app = app = null;
        exports.auth = auth = null;
        exports.db = db = null;
    }
}
