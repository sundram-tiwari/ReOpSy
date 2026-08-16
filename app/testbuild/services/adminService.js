"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateApiUsage = exports.saveFeedOverrides = exports.getFeedOverrides = exports.getApiUsageLogs = exports.getPipelineRuns = exports.getLatestPipelineRun = exports.triggerPipelineTopic = exports.saveSystemPrompt = exports.getSystemPrompt = exports.removeAdmin = exports.addAdmin = exports.getAdminList = exports.checkIsAdmin = void 0;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("./firebase");
/**
 * Check if a specific email has admin privileges
 */
const checkIsAdmin = async (email) => {
    if (!email)
        return false;
    const cleanEmail = email.trim().toLowerCase();
    const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
    if (superAdminEmail && cleanEmail === superAdminEmail) {
        return true;
    }
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db) {
        return false;
    }
    try {
        const adminDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, 'admins', cleanEmail));
        return adminDoc.exists();
    }
    catch (err) {
        console.warn('[adminService] checkIsAdmin error:', err);
        return false;
    }
};
exports.checkIsAdmin = checkIsAdmin;
/**
 * Fetch all registered admin emails from the Firestore admins collection
 */
const getAdminList = async () => {
    const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
    const admins = [];
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db) {
        if (superAdminEmail) {
            return [{ email: superAdminEmail, addedAt: 'System Config', addedBy: 'Super Admin', isSuperAdmin: true }];
        }
        return [];
    }
    try {
        const querySnap = await (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, 'admins'));
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
    }
    catch (err) {
        console.warn('[adminService] getAdminList error:', err);
        if (superAdminEmail) {
            return [{ email: superAdminEmail, addedAt: 'System Config', addedBy: 'Super Admin', isSuperAdmin: true }];
        }
    }
    return admins;
};
exports.getAdminList = getAdminList;
/**
 * Add a secondary admin email to the Firestore whitelist
 */
const addAdmin = async (email, addedBy) => {
    if (!email || typeof email !== 'string')
        throw new Error('Email is required');
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        throw new Error('Invalid email format');
    }
    const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
    if (superAdminEmail && cleanEmail === superAdminEmail) {
        throw new Error('Super Admin is already permanently configured via environment');
    }
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db) {
        throw new Error('Firebase is not configured');
    }
    const adminDocRef = (0, firestore_1.doc)(firebase_1.db, 'admins', cleanEmail);
    const existing = await (0, firestore_1.getDoc)(adminDocRef);
    if (existing.exists()) {
        throw new Error('Email is already whitelisted as admin');
    }
    await (0, firestore_1.setDoc)(adminDocRef, {
        email: cleanEmail,
        addedAt: new Date().toISOString(),
        addedBy
    });
};
exports.addAdmin = addAdmin;
/**
 * Remove an admin email from the Firestore whitelist
 */
const removeAdmin = async (email) => {
    if (!email || typeof email !== 'string')
        throw new Error('Email is required');
    const cleanEmail = email.trim().toLowerCase();
    const superAdminEmail = (process.env?.EXPO_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
    if (superAdminEmail && cleanEmail === superAdminEmail) {
        throw new Error('Cannot remove Super Admin from whitelist');
    }
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db) {
        throw new Error('Firebase is not configured');
    }
    await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, 'admins', cleanEmail));
};
exports.removeAdmin = removeAdmin;
/**
 * Retrieve system prompt from Firestore config collection
 */
const getSystemPrompt = async () => {
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db)
        return null;
    try {
        const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, 'config', 'system_prompt'));
        if (snap.exists()) {
            return snap.data().prompt || null;
        }
    }
    catch (err) {
        console.warn('[adminService] getSystemPrompt error:', err);
    }
    return null;
};
exports.getSystemPrompt = getSystemPrompt;
/**
 * Save system prompt to Firestore config collection
 */
const saveSystemPrompt = async (prompt, updatedBy) => {
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db) {
        throw new Error('Firebase is not configured');
    }
    await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, 'config', 'system_prompt'), {
        prompt: prompt.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy
    });
};
exports.saveSystemPrompt = saveSystemPrompt;
/**
 * Add a topic to the backend pipeline trigger queue
 */
const triggerPipelineTopic = async (topic, requestedBy) => {
    if (!topic || typeof topic !== 'string') {
        throw new Error('Topic is required');
    }
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db) {
        throw new Error('Firebase is not configured');
    }
    const queueItem = {
        topic: topic.trim(),
        requestedAt: new Date().toISOString(),
        status: 'pending',
        requestedBy
    };
    const docRef = await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'pipeline_queue'), queueItem);
    return docRef.id;
};
exports.triggerPipelineTopic = triggerPipelineTopic;
/**
 * Retrieve the most recent pipeline execution run record
 */
const getLatestPipelineRun = async () => {
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db)
        return null;
    try {
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'pipeline_runs'), (0, firestore_1.orderBy)('timestamp', 'desc'), (0, firestore_1.limit)(1));
        const snap = await (0, firestore_1.getDocs)(q);
        if (!snap.empty) {
            const docSnap = snap.docs[0];
            return { id: docSnap.id, ...docSnap.data() };
        }
    }
    catch (err) {
        console.warn('[adminService] getLatestPipelineRun error:', err);
    }
    return null;
};
exports.getLatestPipelineRun = getLatestPipelineRun;
/**
 * Retrieve recent pipeline runs
 */
const getPipelineRuns = async (limitCount = 10) => {
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db)
        return [];
    try {
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'pipeline_runs'), (0, firestore_1.orderBy)('timestamp', 'desc'), (0, firestore_1.limit)(limitCount));
        const snap = await (0, firestore_1.getDocs)(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    catch (err) {
        console.warn('[adminService] getPipelineRuns error:', err);
        return [];
    }
};
exports.getPipelineRuns = getPipelineRuns;
/**
 * Retrieve LLM API usage logs
 */
const getApiUsageLogs = async (limitCount = 50) => {
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db)
        return [];
    try {
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'api_usage'), (0, firestore_1.orderBy)('timestamp', 'desc'), (0, firestore_1.limit)(limitCount));
        const snap = await (0, firestore_1.getDocs)(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    catch (err) {
        console.warn('[adminService] getApiUsageLogs error:', err);
        return [];
    }
};
exports.getApiUsageLogs = getApiUsageLogs;
/**
 * Retrieve flashcard feed overrides from Firestore content/dailyFeed
 */
const getFeedOverrides = async () => {
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db)
        return null;
    try {
        const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, 'content', 'dailyFeed'));
        if (snap.exists()) {
            return snap.data().topics || null;
        }
    }
    catch (err) {
        console.warn('[adminService] getFeedOverrides error:', err);
    }
    return null;
};
exports.getFeedOverrides = getFeedOverrides;
/**
 * Persist modified flashcard feed to Firestore content/dailyFeed
 */
const saveFeedOverrides = async (topics, updatedBy) => {
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db) {
        throw new Error('Firebase is not configured');
    }
    await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, 'content', 'dailyFeed'), {
        topics,
        updatedAt: new Date().toISOString(),
        updatedBy,
        generatedAt: new Date().toISOString()
    });
};
exports.saveFeedOverrides = saveFeedOverrides;
/**
 * Aggregates raw API usage records into summary counts and daily provider breakdown rows.
 */
const aggregateApiUsage = (records) => {
    let totalCalls = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    const dailyMap = {};
    for (const record of records) {
        totalCalls++;
        if (record.success)
            totalSuccess++;
        else
            totalFailed++;
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
        if (record.success)
            dailyMap[key].success++;
        else
            dailyMap[key].failed++;
    }
    const rows = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));
    return {
        summary: { totalCalls, totalSuccess, totalFailed },
        rows
    };
};
exports.aggregateApiUsage = aggregateApiUsage;
