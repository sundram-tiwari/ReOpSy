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
  if (!email || typeof email !== 'string') throw new Error('Email is required');
  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    throw new Error('Invalid email format');
  }

  const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
  if (superAdminEmail && cleanEmail === superAdminEmail) {
    throw new Error('Super Admin is already permanently configured via environment');
  }

  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }

  const adminDocRef = doc(db, 'admins', cleanEmail);
  const existing = await getDoc(adminDocRef);
  if (existing.exists()) {
    throw new Error('Email is already whitelisted as admin');
  }

  await setDoc(adminDocRef, {
    email: cleanEmail,
    addedAt: new Date().toISOString(),
    addedBy
  });
};

/**
 * Remove an admin email from the Firestore whitelist
 */
export const removeAdmin = async (email: string): Promise<void> => {
  if (!email || typeof email !== 'string') throw new Error('Email is required');
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
    prompt: prompt.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy
  });
};

/**
 * Add a topic to the backend pipeline trigger queue
 */
export const triggerPipelineTopic = async (topic: string, requestedBy: string): Promise<string> => {
  if (!topic || typeof topic !== 'string') {
    throw new Error('Topic is required');
  }
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase is not configured');
  }
  const queueItem: PipelineQueueItem = {
    topic: topic.trim(),
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

/**
 * Aggregates raw API usage records into summary counts and daily provider breakdown rows.
 */
export const aggregateApiUsage = (records: ApiUsageRecord[]): {
  summary: { totalCalls: number; totalSuccess: number; totalFailed: number };
  rows: Array<{ date: string; provider: string; total: number; success: number; failed: number }>;
} => {
  let totalCalls = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  const dailyMap: Record<string, { date: string; provider: string; total: number; success: number; failed: number }> = {};

  for (const record of records) {
    totalCalls++;
    if (record.success) totalSuccess++;
    else totalFailed++;

    const date = record.date || (record.timestamp ? record.timestamp.split('T')[0] : 'Unknown');
    const provider = record.provider || 'Other';
    const key = `${date}_${provider}`;

    if (!dailyMap[key]) {
      dailyMap[key] = {
        date,
        provider,
        total: 0,
        success: 0,
        failed: 0
      };
    }

    dailyMap[key].total++;
    if (record.success) dailyMap[key].success++;
    else dailyMap[key].failed++;
  }

  const rows = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  return {
    summary: { totalCalls, totalSuccess, totalFailed },
    rows
  };
};
