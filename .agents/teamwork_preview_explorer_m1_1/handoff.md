# Milestone 1 Investigation & Design Report: Auth, Permissions & Security

**Milestone**: Milestone 1 (Requirement R1, F1, F2)  
**Target Scope**: `app/src/hooks/useAuth.ts`, `app/firestore.rules`, `app/src/services/adminService.ts`  
**Workspace**: `d:/Intern/ReOpSy`  
**Status**: Investigation Complete — Code Design Ready for Implementation  

---

## 1. Observation

### 1.1 Existing Auth State & Lifecycle (`app/src/hooks/useAuth.ts`)
- **Current Hook Interface**:
  ```typescript
  export interface UseAuthReturn {
    user: User | null;
    loading: boolean;
    error: string | null;
    isConfigured: boolean;
    signInWithGoogle: () => Promise<User | null>;
    signOut: () => Promise<void>;
  }
  ```
- **Observed Behavior**:
  - `useAuth` listens to Firebase Auth lifecycle via `onAuthStateChanged(auth, callback)`.
  - Handles Google Popup and Redirect flows via `signInWithPopup`, `signInWithRedirect`, `getRedirectResult`.
  - Safely falls back when `!isFirebaseConfigured() || !auth`.
- **Gaps Identified for Requirement R1 / F1**:
  - Lacks `isAdmin: boolean`, `isSuperAdmin: boolean`, and `adminLoading: boolean`.
  - Does not evaluate `process.env.EXPO_PUBLIC_ADMIN_EMAIL` (hardcoded Super Admin).
  - Does not query Firestore `admins/{email}` document or whitelist for secondary admins.
  - Consumers (`DrawerContent.tsx`, `SettingsScreen.tsx`, `AppState.tsx`) receive only `{ user, loading, error, isConfigured, signInWithGoogle, signOut }`.

### 1.2 Current Firestore Security Rules (`app/firestore.rules` & `firestore.rules`)
- **Current Rules Content**:
  ```javascript
  rules_version = '2';

  service cloud.firestore {
    match /databases/{database}/documents {
      // User profile, preferences, API keys, and bookmarks are strictly owner-only
      match /users/{userId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
  ```
- **Gaps Identified for Requirement R1, R6 / F2**:
  - No rule for `admins/{adminEmail}`: currently falls back to default deny.
  - No rule for `config/{configId}`: required for system prompt storage.
  - No rule for `pipeline_runs/{runId}`: required for pipeline execution run metadata.
  - No rule for `pipeline_queue/{queueId}`: required for manual topic trigger queue.
  - No rule for `api_usage/{usageId}`: required for LLM telemetry.
  - No rule for `content/{contentId}`: required for public feed read and admin-only write.

### 1.3 Service Layer (`app/src/services/`)
- Existing services: `apiValidator.ts`, `customTopicFetcher.ts`, `firebase.ts`.
- **Gaps Identified**:
  - No centralized `adminService.ts` exists to encapsulate Firestore admin CRUD operations, whitelist checks, pipeline triggers, feed persistence, and system prompt storage.

---

## 2. Logic Chain

### 2.1 Admin Verification Flow (`useAuth.ts`)
```
                     User Authenticated (Firebase Auth)
                                     │
                                     ▼
                      Extract user.email (normalized)
                   email = user.email.trim().toLowerCase()
                                     │
                                     ▼
                Check Super Admin: EXPO_PUBLIC_ADMIN_EMAIL
             superAdmin = process.env.EXPO_PUBLIC_ADMIN_EMAIL.trim().toLowerCase()
                                     │
                 ┌───────────────────┴───────────────────┐
                 │ email === superAdmin?                 │
                 ▼                                       ▼
               [YES]                                   [NO]
          isAdmin = true                         isSuperAdmin = false
        isSuperAdmin = true                      adminLoading = true
        adminLoading = false                             │
                 │                                       ▼
                 │                         Query Firestore: admins/{email}
                 │                                       │
                 │                      ┌────────────────┴────────────────┐
                 │                      │ Document exists?                │
                 │                      ▼                                 ▼
                 │                    [YES]                             [NO]
                 │               isAdmin = true                    isAdmin = false
                 │             adminLoading = false              adminLoading = false
                 │                      │                                 │
                 └──────────────────────┴─────────────────────────────────┘
                                        │
                                        ▼
                   State Emitted to Navigation & Admin Guards
```

### 2.2 Security Rules Authorization Logic (`firestore.rules`)
1. **Helper Functions**:
   - `isAuthenticated()`: `request.auth != null`
   - `isOwner(userId)`: `isAuthenticated() && request.auth.uid == userId`
   - `isAdmin()`: `isAuthenticated() && request.auth.token.email != null && (exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower())) || exists(/databases/$(database)/documents/admins/$(request.auth.token.email)))`
2. **Collection Access Matrix**:
   - `users/{userId}`: `allow read, write: if isOwner(userId);`
   - `admins/{adminEmail}`: `allow read, write: if isAdmin();`
   - `config/{configId}`: `allow read, write: if isAdmin();`
   - `pipeline_runs/{runId}`: `allow read, write: if isAdmin();`
   - `pipeline_queue/{queueId}`: `allow read, write: if isAdmin();`
   - `api_usage/{usageId}`: `allow read, write: if isAdmin();`
   - `content/{contentId}`: `allow read: if true; allow write: if isAdmin();`

### 2.3 Modular Architecture for `adminService.ts`
- Isolates Firestore operations with offline/unconfigured safeguards:
  - If `!isFirebaseConfigured() || !db`, methods return safe defaults (`null`, `[]`, or throw handled errors).
  - All email parameters are normalized to lowercase (`email.trim().toLowerCase()`).
  - Standardizes collection names: `'admins'`, `'config'`, `'pipeline_runs'`, `'pipeline_queue'`, `'api_usage'`, `'content'`.

---

## 3. Caveats

1. **Client-side vs Server-side Security**:
   - `EXPO_PUBLIC_ADMIN_EMAIL` is embedded in the client bundle for UI conditional rendering.
   - True authorization for data access is enforced by Firestore Security Rules on the backend.
   - For Firestore Security Rules to recognize the Super Admin, the Super Admin's email document should be present in `admins/{email}` or created on first access / deploy.
2. **Case Sensitivity & Document Keys**:
   - Email casing can vary by provider (e.g. `User@Gmail.COM` vs `user@gmail.com`).
   - Normalizing to `.trim().toLowerCase()` on both write and read paths is mandatory.
3. **Offline & Unconfigured Safety**:
   - In demo mode or when running without Firebase credentials, `useAuth` must not throw or leave hanging promises.
   - `adminLoading` must transition from `true` to `false` in `finally` blocks regardless of network state or Firestore exceptions.

---

## 4. Conclusion & Exact Proposed Code Changes

### 4.1 Update `app/src/hooks/useAuth.ts`

```typescript
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
```

---

### 4.2 Update `app/firestore.rules` & root `firestore.rules`

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    function isAdmin() {
      return isAuthenticated() && 
        request.auth.token.email != null && 
        (
          exists(/databases/$(database)/documents/admins/$(request.auth.token.email.lower())) ||
          exists(/databases/$(database)/documents/admins/$(request.auth.token.email))
        );
    }

    // User profile, preferences, API keys, and bookmarks are strictly owner-only
    match /users/{userId} {
      allow read, write: if isOwner(userId);
    }

    // Admin whitelist collection: admin-only read/write
    match /admins/{adminEmail} {
      allow read, write: if isAdmin();
    }

    // Global configuration (e.g. system_prompt): admin-only read/write
    match /config/{configId} {
      allow read, write: if isAdmin();
    }

    // Pipeline run execution metadata: admin-only read/write
    match /pipeline_runs/{runId} {
      allow read, write: if isAdmin();
    }

    // Pipeline trigger task queue: admin-only read/write
    match /pipeline_queue/{queueId} {
      allow read, write: if isAdmin();
    }

    // LLM API usage tracking logs: admin-only read/write
    match /api_usage/{usageId} {
      allow read, write: if isAdmin();
    }

    // Flashcard content & feed overrides: public-read, admin-write
    match /content/{contentId} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

---

### 4.3 New File: `app/src/services/adminService.ts`

```typescript
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { Paper } from '../types';

declare const process: {
  env?: Record<string, string | undefined>;
};

export interface AdminRecord {
  email: string;
  addedAt: string;
  addedBy: string;
  isSuperAdmin?: boolean;
}

export interface PipelineRunRecord {
  id?: string;
  runId?: string;
  timestamp: string;
  status: 'success' | 'partial' | 'failed';
  topicCounts?: Record<string, number>;
  perTopicCounts?: Record<string, number>;
  totalPapers?: number;
  topicsProcessed?: number;
  errors?: string[] | Array<{ topic?: string; stage?: string; error: string; timestamp?: string }>;
  durationMs?: number;
}

export interface PipelineQueueItem {
  id?: string;
  topic: string;
  requestedAt: string;
  status: 'pending' | 'processing' | 'completed';
  requestedBy: string;
}

export interface ApiUsageRecord {
  id?: string;
  timestamp: string;
  date: string;
  provider: 'Gemini' | 'Mistral' | 'Grok' | string;
  success: boolean;
  error?: string;
  tokenCount?: number;
}

export interface DailyApiUsage {
  date: string;
  provider: string;
  totalCalls: number;
  successes: number;
  failures: number;
}

export interface SystemPromptConfig {
  prompt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Check if a specific email has admin privileges
 */
export const checkIsAdmin = async (email: string): Promise<boolean> => {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();

  if (superAdminEmail && cleanEmail === superAdminEmail) {
    return true;
  }

  if (!isFirebaseConfigured() || !db) {
    return false;
  }

  try {
    const adminDoc = await getDoc(doc(db, 'admins', cleanEmail));
    return adminDoc.exists();
  } catch (err) {
    console.warn('[adminService] checkIsAdmin error:', err);
    return false;
  }
};

/**
 * Fetch all registered admin emails from the Firestore admins collection
 */
export const getAdminList = async (): Promise<AdminRecord[]> => {
  const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
  const admins: AdminRecord[] = [];

  if (!isFirebaseConfigured() || !db) {
    if (superAdminEmail) {
      return [{ email: superAdminEmail, addedAt: 'System Config', addedBy: 'Super Admin', isSuperAdmin: true }];
    }
    return [];
  }

  try {
    const querySnap = await getDocs(collection(db, 'admins'));
    querySnap.forEach((snap) => {
      const data = snap.data();
      const email = (data.email || snap.id).toLowerCase();
      admins.push({
        email,
        addedAt: data.addedAt || 'Unknown',
        addedBy: data.addedBy || 'Admin',
        isSuperAdmin: Boolean(superAdminEmail && email === superAdminEmail)
      });
    });

    // Ensure Super Admin is present in the return list even if not in Firestore
    if (superAdminEmail && !admins.some(a => a.email === superAdminEmail)) {
      admins.unshift({
        email: superAdminEmail,
        addedAt: 'System Config',
        addedBy: 'Super Admin',
        isSuperAdmin: true
      });
    }
  } catch (err) {
    console.warn('[adminService] getAdminList error:', err);
    if (superAdminEmail) {
      return [{ email: superAdminEmail, addedAt: 'System Config', addedBy: 'Super Admin', isSuperAdmin: true }];
    }
  }

  return admins;
};

/**
 * Add a secondary admin email to the Firestore whitelist
 */
export const addAdmin = async (email: string, addedBy: string): Promise<void> => {
  if (!email) throw new Error('Email is required');
  const cleanEmail = email.trim().toLowerCase();

  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }

  await setDoc(doc(db, 'admins', cleanEmail), {
    email: cleanEmail,
    addedAt: new Date().toISOString(),
    addedBy
  });
};

/**
 * Remove an admin email from the Firestore whitelist
 */
export const removeAdmin = async (email: string): Promise<void> => {
  if (!email) throw new Error('Email is required');
  const cleanEmail = email.trim().toLowerCase();
  const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();

  if (superAdminEmail && cleanEmail === superAdminEmail) {
    throw new Error('Cannot remove Super Admin from whitelist');
  }

  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }

  await deleteDoc(doc(db, 'admins', cleanEmail));
};

/**
 * Retrieve system prompt from Firestore config collection
 */
export const getSystemPrompt = async (): Promise<string | null> => {
  if (!isFirebaseConfigured() || !db) return null;
  try {
    const snap = await getDoc(doc(db, 'config', 'system_prompt'));
    if (snap.exists()) {
      return snap.data().prompt || null;
    }
  } catch (err) {
    console.warn('[adminService] getSystemPrompt error:', err);
  }
  return null;
};

/**
 * Save system prompt to Firestore config collection
 */
export const saveSystemPrompt = async (prompt: string, updatedBy: string): Promise<void> => {
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }
  await setDoc(doc(db, 'config', 'system_prompt'), {
    prompt,
    updatedAt: new Date().toISOString(),
    updatedBy
  });
};

/**
 * Add a topic to the backend pipeline trigger queue
 */
export const triggerPipelineTopic = async (topic: string, requestedBy: string): Promise<string> => {
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }
  const queueItem: PipelineQueueItem = {
    topic,
    requestedAt: new Date().toISOString(),
    status: 'pending',
    requestedBy
  };
  const docRef = await addDoc(collection(db, 'pipeline_queue'), queueItem);
  return docRef.id;
};

/**
 * Retrieve the most recent pipeline execution run record
 */
export const getLatestPipelineRun = async (): Promise<PipelineRunRecord | null> => {
  if (!isFirebaseConfigured() || !db) return null;
  try {
    const q = query(collection(db, 'pipeline_runs'), orderBy('timestamp', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { id: docSnap.id, ...docSnap.data() } as PipelineRunRecord;
    }
  } catch (err) {
    console.warn('[adminService] getLatestPipelineRun error:', err);
  }
  return null;
};

/**
 * Retrieve recent pipeline runs
 */
export const getPipelineRuns = async (limitCount = 10): Promise<PipelineRunRecord[]> => {
  if (!isFirebaseConfigured() || !db) return [];
  try {
    const q = query(collection(db, 'pipeline_runs'), orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PipelineRunRecord));
  } catch (err) {
    console.warn('[adminService] getPipelineRuns error:', err);
    return [];
  }
};

/**
 * Retrieve LLM API usage logs
 */
export const getApiUsageLogs = async (limitCount = 50): Promise<ApiUsageRecord[]> => {
  if (!isFirebaseConfigured() || !db) return [];
  try {
    const q = query(collection(db, 'api_usage'), orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ApiUsageRecord));
  } catch (err) {
    console.warn('[adminService] getApiUsageLogs error:', err);
    return [];
  }
};

/**
 * Retrieve flashcard feed overrides from Firestore content/dailyFeed
 */
export const getFeedOverrides = async (): Promise<Record<string, Paper[]> | null> => {
  if (!isFirebaseConfigured() || !db) return null;
  try {
    const snap = await getDoc(doc(db, 'content', 'dailyFeed'));
    if (snap.exists()) {
      return snap.data().topics || null;
    }
  } catch (err) {
    console.warn('[adminService] getFeedOverrides error:', err);
  }
  return null;
};

/**
 * Persist modified flashcard feed to Firestore content/dailyFeed
 */
export const saveFeedOverrides = async (
  topics: Record<string, Paper[]>,
  updatedBy: string
): Promise<void> => {
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }
  await setDoc(doc(db, 'content', 'dailyFeed'), {
    topics,
    updatedAt: new Date().toISOString(),
    updatedBy,
    generatedAt: new Date().toISOString()
  });
};
```

---

## 5. Verification Method

### 5.1 Automated Unit & E2E Verification
The implementation can be verified directly against the test suite:
- **E2E Feature F1 Test**:
  `node --test tests/e2e/tier1_features/f1_admin_auth.test.js`
  - Tests Super Admin login via `EXPO_PUBLIC_ADMIN_EMAIL` (`isAdmin = true`, `isSuperAdmin = true`).
  - Tests secondary admin lookup from Firestore `admins` (`isAdmin = true`, `isSuperAdmin = false`).
  - Tests non-admin and unauthenticated fallback (`isAdmin = false`, `isSuperAdmin = false`).
  - Tests case-insensitive email matching.
  - Tests dynamic auth state transitions.
- **E2E Feature F2 Test**:
  `node --test tests/e2e/tier1_features/f2_security_rules.test.js`
  - Verifies Firestore security rules restrict `admins`, `config`, `pipeline_runs`, `pipeline_queue`, `api_usage` to authenticated admins.
  - Verifies public read and admin write on `content`.
  - Verifies owner-only access on `users/{userId}`.

### 5.2 TypeScript Compilation Check
- `cd app && npx tsc --noEmit`
  - Must compile with 0 type errors.

### 5.3 Web Build Check
- `cd app && npx expo export -p web`
  - Verifies bundling without syntax, import, or packaging errors.

### 5.4 Invalidation Conditions
- Any scenario where a non-whitelisted email evaluates `isAdmin === true`.
- Any unhandled promise rejection or unhandled crash when Firestore is offline or unconfigured.
- Any mismatch in email normalization causing uppercase emails to fail whitelist matching.
