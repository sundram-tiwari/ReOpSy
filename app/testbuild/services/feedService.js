"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLiveFeed = fetchLiveFeed;
const firebase_1 = require("./firebase");
const firestore_1 = require("firebase/firestore");
/**
 * Fetch the latest daily feed from Firestore `feeds/latest` document.
 *
 * Uses a single `getDoc` call (not a real-time listener) to keep
 * Firestore read costs minimal. Returns null if Firestore is not
 * configured, the document doesn't exist, or any error occurs.
 *
 * The caller should use the static `dailyFeed.json` import as a fallback.
 */
async function fetchLiveFeed() {
    if (!(0, firebase_1.isFirebaseConfigured)() || !firebase_1.db) {
        return null;
    }
    try {
        const feedDocRef = (0, firestore_1.doc)(firebase_1.db, 'feeds', 'latest');
        const feedSnap = await (0, firestore_1.getDoc)(feedDocRef);
        if (!feedSnap.exists()) {
            console.log('[FeedService] No live feed document found in Firestore. Using static fallback.');
            return null;
        }
        const data = feedSnap.data();
        if (!data || !data.topics || typeof data.topics !== 'object') {
            console.warn('[FeedService] Live feed document has invalid structure. Using static fallback.');
            return null;
        }
        // Validate that topics contain arrays of paper-like objects
        const topics = {};
        for (const [slug, papers] of Object.entries(data.topics)) {
            if (Array.isArray(papers)) {
                // Filter out any malformed entries
                const validPapers = papers.filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.originalTitle === 'string');
                if (validPapers.length > 0) {
                    topics[slug] = validPapers;
                }
            }
        }
        if (Object.keys(topics).length === 0) {
            console.warn('[FeedService] Live feed has no valid topic data. Using static fallback.');
            return null;
        }
        console.log(`[FeedService] Live feed loaded from Firestore. Generated: ${data.generatedAt || 'unknown'}. Topics: ${Object.keys(topics).length}`);
        return {
            generatedAt: data.generatedAt || new Date().toISOString(),
            topics,
        };
    }
    catch (err) {
        console.warn('[FeedService] Failed to fetch live feed from Firestore:', err?.message || err);
        return null;
    }
}
