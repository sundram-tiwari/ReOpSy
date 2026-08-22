'use strict';

const admin = require('firebase-admin');

let adminDb = null;
let _initialized = false;

/**
 * Initialize Firebase Admin SDK from environment variable.
 * The FIREBASE_SERVICE_ACCOUNT env var should contain the full JSON
 * of a Firebase service account key (downloaded from Firebase Console).
 *
 * Falls back gracefully: if no credentials are found, adminDb stays null
 * and the pipeline continues writing to disk only.
 */
function initializeFirebaseAdmin() {
  if (_initialized) return adminDb;
  _initialized = true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

  if (!serviceAccountJson) {
    if (projectId) {
      console.log('[Firebase Admin] No FIREBASE_SERVICE_ACCOUNT env var set. Firestore sync disabled.');
      console.log('[Firebase Admin] To enable live feed sync, add a service account key to Render environment variables.');
    }
    return null;
  }

  try {
    let serviceAccount;
    if (typeof serviceAccountJson === 'string') {
      serviceAccount = JSON.parse(serviceAccountJson);
    } else {
      serviceAccount = serviceAccountJson;
    }

    // Validate minimum required fields
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      console.error('[Firebase Admin] Service account JSON is missing required fields (project_id, private_key, client_email).');
      return null;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    adminDb = admin.firestore();
    console.log(`[Firebase Admin] Initialized successfully for project: ${serviceAccount.project_id}`);
    return adminDb;
  } catch (err) {
    console.error('[Firebase Admin] Failed to initialize:', err.message);
    return null;
  }
}

/**
 * Check whether the Admin SDK is configured and ready.
 */
function isAdminConfigured() {
  return adminDb !== null;
}

/**
 * Get the Firestore database instance (or null if not configured).
 */
function getAdminDb() {
  if (!_initialized) {
    initializeFirebaseAdmin();
  }
  return adminDb;
}

module.exports = {
  initializeFirebaseAdmin,
  isAdminConfigured,
  getAdminDb,
  get adminDb() {
    return getAdminDb();
  },
};
