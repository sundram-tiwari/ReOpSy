import { db, isFirebaseConfigured } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Paper } from '../types';

export interface LiveFeedData {
  generatedAt: string;
  topics: Record<string, Paper[]>;
}

/**
 * Fetch the latest daily feed from Firestore `feeds/latest` document.
 *
 * Uses a single `getDoc` call (not a real-time listener) to keep
 * Firestore read costs minimal. Returns null if Firestore is not
 * configured, the document doesn't exist, or any error occurs.
 *
 * The caller should use the static `dailyFeed.json` import as a fallback.
 */
export async function fetchLiveFeed(): Promise<LiveFeedData | null> {
  if (!isFirebaseConfigured() || !db) {
    return null;
  }

  try {
    const feedDocRef = doc(db, 'feeds', 'latest');
    const feedSnap = await getDoc(feedDocRef);

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
    const topics: Record<string, Paper[]> = {};
    for (const [slug, papers] of Object.entries(data.topics)) {
      if (Array.isArray(papers)) {
        // Filter out any malformed entries
        const validPapers = (papers as any[]).filter(
          (p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.originalTitle === 'string'
        ) as Paper[];
        if (validPapers.length > 0) {
          topics[slug] = validPapers;
        }
      }
    }

    if (Object.keys(topics).length === 0) {
      console.warn('[FeedService] Live feed has no valid topic data. Using static fallback.');
      return null;
    }

    console.log(
      `[FeedService] Live feed loaded from Firestore. Generated: ${data.generatedAt || 'unknown'}. Topics: ${Object.keys(topics).length}`
    );

    return {
      generatedAt: data.generatedAt || new Date().toISOString(),
      topics,
    };
  } catch (err: any) {
    console.warn('[FeedService] Failed to fetch live feed from Firestore:', err?.message || err);
    return null;
  }
}
