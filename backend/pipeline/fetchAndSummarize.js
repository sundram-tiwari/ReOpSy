#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { TOPICS, ALL_SLUGS } = require('../ingest/lib/topics');
const openalex = require('../ingest/lib/openalex');
const arxiv = require('../ingest/lib/arxiv');
const { dedupe } = require('../ingest/lib/dedupe');
const { loadEnv, isoDaysAgo } = require('../ingest/ingest');
const { fetchTldr } = require('./semanticScholar');
const { generateCatchyTitle } = require('./llm');
const { summarize: fallbackSummarize } = require('../ingest/lib/summarize');
const { insertPaper, getLatestPapersForTopic, db: sqliteDb } = require('../db/db');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Log pipeline run execution metadata to Firestore pipeline_runs collection.
 * Zero-failure propagation: errors are caught and logged as non-fatal warnings.
 * @param {Object} db - Firestore instance or null
 * @param {Object} runData - { runId, timestamp, topicCounts, totalPapers, errors, status, durationMs }
 * @returns {Promise<Object|undefined>}
 */
async function logPipelineRun(db, runData = {}) {
  const runId = runData.runId || `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const topicCounts = runData.topicCounts || {};
  let totalPapers = runData.totalPapers !== undefined ? runData.totalPapers : 0;
  if (totalPapers === 0 && Object.keys(topicCounts).length > 0) {
    for (const count of Object.values(topicCounts)) {
      totalPapers += (typeof count === 'number' ? count : 0);
    }
  }

  const errors = Array.isArray(runData.errors) ? runData.errors.map(err => {
    if (typeof err === 'string') {
      return err.length > 1000 ? `${err.substring(0, 1000)}... [truncated]` : err;
    }
    return JSON.stringify(err);
  }) : [];

  let status = runData.status;
  if (!status) {
    if (errors.length === 0) {
      status = 'success';
    } else {
      const hasPapers = totalPapers > 0 || Object.values(topicCounts).some(c => typeof c === 'number' && c > 0);
      status = hasPapers ? 'partial' : 'failed';
    }
  }

  const docData = {
    runId,
    timestamp: runData.timestamp || new Date().toISOString(),
    topicCounts,
    totalPapers,
    errors,
    status,
    ...(typeof runData.durationMs === 'number' ? { durationMs: runData.durationMs } : {})
  };

  if (!db) {
    // Try REST fallback if project ID is available
    const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/pipeline_runs?documentId=${runId}`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              runId: { stringValue: runId },
              timestamp: { stringValue: docData.timestamp },
              status: { stringValue: docData.status },
              totalPapers: { integerValue: String(docData.totalPapers) }
            }
          })
        });
      } catch (err) {
        console.warn('[logPipelineRun] REST logging error:', err.message);
      }
    }
    return docData;
  }

  try {
    if (typeof db.setDoc === 'function' && typeof db.doc === 'function') {
      await db.setDoc(db.doc('pipeline_runs', runId), docData);
    } else if (typeof db.collection === 'function') {
      const col = db.collection('pipeline_runs');
      if (typeof col.doc === 'function') {
        await col.doc(runId).set(docData);
      } else if (typeof db.addDoc === 'function') {
        await db.addDoc(col, docData);
      }
    }
    return docData;
  } catch (err) {
    console.warn('[logPipelineRun] Non-fatal logging error:', err.message || err);
    return docData;
  }
}

/**
 * Process pending topic fetch requests in Firestore pipeline_queue collection.
 * Transitions items: pending -> processing -> completed / failed.
 * @param {Object} db - Firestore database instance
 * @param {Object} options - execution options
 * @returns {Promise<Array<Object>>}
 */
async function processPipelineQueue(db, options = {}) {
  if (!db) return [];
  const processedItems = [];

  try {
    let pendingDocs = [];
    if (typeof db.collection === 'function' && typeof db.getDocs === 'function') {
      const queueCol = db.collection('pipeline_queue');
      if (typeof db.query === 'function' && typeof db.where === 'function') {
        const q = db.query(queueCol, db.where('status', '==', 'pending'));
        const snap = await db.getDocs(q);
        pendingDocs = snap.docs || [];
      } else {
        const snap = await db.getDocs(queueCol);
        pendingDocs = (snap.docs || []).filter(d => {
          const data = typeof d.data === 'function' ? d.data() : d;
          return data.status === 'pending';
        });
      }
    }

    for (const docSnap of pendingDocs) {
      const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
      const docRef = docSnap.ref || (typeof db.doc === 'function' ? db.doc('pipeline_queue', docSnap.id) : null);
      const topic = data.topic;

      if (!topic || (!ALL_SLUGS.includes(topic) && topic !== 'all')) {
        if (docRef && typeof db.updateDoc === 'function') {
          await db.updateDoc(docRef, {
            status: 'failed',
            error: `Invalid topic: ${topic}`,
            processedAt: new Date().toISOString()
          });
        }
        continue;
      }

      // Transition to processing
      if (docRef && typeof db.updateDoc === 'function') {
        await db.updateDoc(docRef, {
          status: 'processing',
          startedAt: new Date().toISOString()
        });
      }

      try {
        const result = await fetchAndSummarize({
          ...options,
          topic: topic === 'all' ? undefined : topic,
          db,
          isQueueExecution: true
        });

        const papersFetched = result.totalPapers || 0;
        if (docRef && typeof db.updateDoc === 'function') {
          await db.updateDoc(docRef, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            papersFetched
          });
        }
        processedItems.push({ id: docSnap.id, topic, status: 'completed', papersFetched });
      } catch (topicErr) {
        if (docRef && typeof db.updateDoc === 'function') {
          await db.updateDoc(docRef, {
            status: 'failed',
            error: topicErr.message,
            completedAt: new Date().toISOString()
          });
        }
        processedItems.push({ id: docSnap.id, topic, status: 'failed', error: topicErr.message });
      }
    }
  } catch (err) {
    console.warn('[processPipelineQueue] Non-fatal queue processing error:', err.message || err);
  }

  return processedItems;
}

/**
 * Check Firestore content/dailyFeed and content collection for admin overrides and deletions.
 * Applies admin-modified titles, summaries, or paper deletions to feedData.
 * @param {Object} feedData - dailyFeed object
 * @param {Object|null} db - Firestore database instance
 * @returns {Promise<Object>} updated feedData
 */
async function applyContentOverrides(feedData, db = null) {
  if (!db || !feedData || !feedData.topics || typeof feedData.topics !== 'object') return feedData;

  try {
    // 1. Check content/dailyFeed document
    let dailyFeedDocSnap = null;
    if (typeof db.getDoc === 'function' && typeof db.doc === 'function') {
      try {
        dailyFeedDocSnap = await db.getDoc(db.doc('content', 'dailyFeed'));
      } catch (e) {
        // Document might not exist
      }
    }

    if (dailyFeedDocSnap) {
      const data = typeof dailyFeedDocSnap.data === 'function' ? dailyFeedDocSnap.data() : dailyFeedDocSnap;
      const exists = typeof dailyFeedDocSnap.exists === 'function' ? dailyFeedDocSnap.exists() : Boolean(data);
      if (exists && data && data.topics && typeof data.topics === 'object') {
        for (const [topic, adminPapers] of Object.entries(data.topics)) {
          if (Array.isArray(adminPapers) && feedData.topics[topic] && Array.isArray(feedData.topics[topic])) {
            // Apply admin paper overrides or custom order
            const validAdminPapers = adminPapers.filter(p => p && typeof p === 'object' && p.id);
            const adminMap = new Map(validAdminPapers.map(p => [p.id, p]));
            
            // Overwrite modified fields for existing papers
            feedData.topics[topic] = feedData.topics[topic]
              .filter(p => {
                if (!p || !p.id) return false;
                const adminP = adminMap.get(p.id);
                return !adminP || adminP.isDeleted !== true;
              })
              .map(p => {
                if (!p || !p.id) return p;
                const adminP = adminMap.get(p.id);
                if (adminP) {
                  return {
                    ...p,
                    catchyTitle: adminP.catchyTitle || p.catchyTitle,
                    originalTitle: adminP.originalTitle || p.originalTitle,
                    summary: adminP.summary || p.summary,
                    url: adminP.url || p.url,
                    source: adminP.source || p.source,
                    authors: adminP.authors || p.authors,
                    year: adminP.year !== undefined ? adminP.year : p.year,
                    venue: adminP.venue || p.venue,
                    pdfUrl: adminP.pdfUrl !== undefined ? adminP.pdfUrl : p.pdfUrl
                  };
                }
                return p;
              });

            // If admin added curated papers not in current feed, include them
            for (const adminP of validAdminPapers) {
              if (adminP && adminP.id && adminP.isDeleted !== true && !feedData.topics[topic].some(p => p && p.id === adminP.id)) {
                feedData.topics[topic].push(adminP);
              }
            }
          }
        }
      }
    }

    // 2. Check individual content collection overrides
    if (typeof db.collection === 'function' && typeof db.getDocs === 'function') {
      try {
        const contentCol = db.collection('content');
        const contentDocs = await db.getDocs(contentCol);
        for (const doc of (contentDocs.docs || [])) {
          if (doc.id === 'dailyFeed') continue; // Handled above
          const override = typeof doc.data === 'function' ? doc.data() : doc;
          if (override && override.topic && feedData.topics[override.topic] && Array.isArray(feedData.topics[override.topic])) {
            const targetId = override.id || doc.id;
            if (!targetId) continue;
            if (override.isDeleted) {
              feedData.topics[override.topic] = feedData.topics[override.topic].filter(p => p && p.id !== targetId);
            } else {
              const targetIndex = feedData.topics[override.topic].findIndex(p => p && p.id === targetId);
              if (targetIndex !== -1) {
                const currentPaper = feedData.topics[override.topic][targetIndex];
                if (currentPaper) {
                  feedData.topics[override.topic][targetIndex] = {
                    ...currentPaper,
                    catchyTitle: override.catchyTitle || currentPaper.catchyTitle,
                    summary: override.summary || currentPaper.summary,
                    url: override.url || currentPaper.url,
                    source: override.source || currentPaper.source
                  };
                }
              }
            }
          }
        }
      } catch (e) {
        // Individual content overrides non-fatal
      }
    }
  } catch (err) {
    console.warn('[applyContentOverrides] Non-fatal content override error:', err.message || err);
  }

  return feedData;
}

/**
 * Main pipeline entrypoint to fetch, summarize, and generate daily feed.
 * Fully supports offline SQLite operation and Firestore integration for metadata logging.
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function fetchAndSummarize(options = {}) {
  const startTime = Date.now();
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    loadEnv(envPath);
  }

  const firestoreDb = options.db || options.firestore || null;

  // Process pending queue items if requested and not in recursive queue execution
  if (!options.isQueueExecution && firestoreDb) {
    await processPipelineQueue(firestoreDb, options);
  }

  const apiKeys = {
    gemini: process.env.GEMINI_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    xai: process.env.XAI_API_KEY
  };
  if (!apiKeys.gemini && !apiKeys.mistral && !apiKeys.xai) {
    console.warn('⚠️ No API keys set for LLM title generation.');
  }

  const dryRun = options.dryRun !== undefined ? options.dryRun : process.argv.includes('--dry');
  const limitPerSource = options.limitPerSource || 5;
  const fromDate = isoDaysAgo(30);
  const outPath = options.outputFeedPath || path.join(__dirname, '..', '..', 'app', 'src', 'data', 'dailyFeed.json');

  const topicsToProcess = options.topic
    ? [options.topic]
    : (options.topics && Array.isArray(options.topics) ? options.topics : ALL_SLUGS);

  const feedData = {
    generatedAt: new Date().toISOString(),
    topics: {}
  };

  let topicsProcessed = 0;
  let totalPapers = 0;
  const topicCounts = {};
  const errors = [];

  for (const topic of topicsToProcess) {
    console.log(`\nProcessing topic: ${topic}`);
    let collected = [];
    let topicPapersCount = 0;

    // 1. Fetch OpenAlex
    try {
      console.log(`  Fetching OpenAlex for ${topic}...`);
      const oaPapers = await openalex.fetchTopic({ topic, limit: limitPerSource, fromDate });
      collected.push(...oaPapers);
    } catch (e) {
      console.error(`  OpenAlex failed: ${e.message}`);
      errors.push(`OpenAlex failed for topic ${topic}: ${e.message}`);
    }

    // 2. Fetch arXiv
    try {
      console.log(`  Fetching arXiv for ${topic}...`);
      const arxivPapers = await arxiv.fetchTopic({ topic, limit: limitPerSource });
      collected.push(...arxivPapers);
      await delay(3000); // polite rate limit
    } catch (e) {
      console.error(`  arXiv failed: ${e.message}`);
      errors.push(`arXiv timeout for topic ${topic}: ${e.message}`);
    }

    // 3. Dedupe and filter (accept summary or abstract)
    const { papers: deduped } = dedupe(collected);
    const validPapers = deduped.filter(p => (p.summary || p.abstract) && p.title && p.url).slice(0, 10);
    console.log(`  Fetched ${validPapers.length} valid papers for ${topic}.`);
    topicsProcessed++;

    // 4. Summarize & Title Generation
    if (validPapers.length > 0 && !dryRun) {
      for (let j = 0; j < validPapers.length; j++) {
        const p = validPapers[j];
        
        let summary = await fetchTldr(p.title);
        if (!summary && p.summary) {
          summary = p.summary;
        }
        if (!summary) {
          summary = fallbackSummarize(p.abstract || p.title, p.title);
        }
        if (!summary) {
          summary = 'No abstract available.';
        }

        const llmRes = await generateCatchyTitle(p.title, summary, apiKeys, { db: firestoreDb });
        const catchyTitle = llmRes.catchyTitle;

        const paperRecord = {
          id: p.id,
          originalTitle: p.title,
          catchyTitle,
          summary,
          authors: p.authors || [],
          source: p.source,
          year: p.year,
          venue: p.venue || p.source,
          url: p.url,
          pdfUrl: p.pdf_url
        };

        try {
          await insertPaper(topic, paperRecord);
        } catch (err) {
          console.error(`  Failed to insert paper ${p.id}: ${err.message}`);
          errors.push(`Failed to insert paper ${p.id} for topic ${topic}: ${err.message}`);
        }
      }
    }

    // 5. Generate Frontend Feed from DB
    if (!dryRun) {
       let latestPapers = await getLatestPapersForTopic(topic, 10);
       
       // Fallback to validPapers if DB is empty for any reason
       if (latestPapers.length === 0 && validPapers.length > 0) {
         latestPapers = validPapers.map(p => ({
           id: p.id,
           originalTitle: p.title,
           catchyTitle: p.title,
           summary: p.summary || (p.abstract ? fallbackSummarize(p.abstract, p.title) : 'No abstract available.'),
           authors: p.authors || [],
           source: p.source,
           year: p.year,
           venue: p.venue || p.source,
           url: p.url,
           pdfUrl: p.pdf_url,
           topics: [topic],
           likes: 0
         }));
       }

       // CRITICAL: NEVER write an empty array.
       if (latestPapers.length === 0) {
         console.warn(`  No papers found for topic ${topic} in DB. Adding dummy entry.`);
         latestPapers = [{
           id: `dummy-${topic}-${Date.now()}`,
           originalTitle: `No recent papers for ${topic}`,
           catchyTitle: `Check back later for ${topic}`,
           summary: `We could not find any recent papers for ${topic} at this time.`,
           authors: ['ReOpSy System'],
           source: 'system',
           year: new Date().getFullYear(),
           venue: 'System Notification',
           url: '#',
           pdfUrl: null,
           topics: [topic],
           likes: 0
         }];
       }
       
       feedData.topics[topic] = latestPapers;
       topicPapersCount = latestPapers.length;
       totalPapers += topicPapersCount;
    } else {
      topicPapersCount = validPapers.length;
      totalPapers += topicPapersCount;
    }

    topicCounts[topic] = topicPapersCount;
  }

  const durationMs = Date.now() - startTime;
  let status = 'success';
  if (errors.length > 0) {
    status = totalPapers === 0 ? 'failed' : 'partial';
  }

  // Record pipeline run metadata to Firestore pipeline_runs collection
  const runLog = await logPipelineRun(firestoreDb, {
    topicCounts,
    totalPapers,
    errors,
    status,
    durationMs
  });

  if (dryRun) {
    console.log('\nDRY RUN COMPLETE.');
    return { success: true, topicsProcessed, totalPapers, errors, runId: runLog?.runId, status };
  }

  // Apply content overrides from Firestore before writing to disk
  await applyContentOverrides(feedData, firestoreDb);

  // Write to frontend data folder
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(feedData, null, 2), 'utf8');
    console.log(`\n✅ Feed generated at ${outPath}`);
  } catch (fsErr) {
    console.error(`Failed to write feed file at ${outPath}: ${fsErr.message}`);
    errors.push(`Failed to write feed file: ${fsErr.message}`);
  }
  
  return {
    success: status !== 'failed',
    topicsProcessed,
    totalPapers,
    errors,
    runId: runLog?.runId,
    status,
    durationMs
  };
}

if (require.main === module) {
  fetchAndSummarize({ dryRun: process.argv.includes('--dry') })
    .then(() => {
      if (!process.argv.includes('--dry')) {
        sqliteDb.close();
      }
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  fetchAndSummarize,
  logPipelineRun,
  processPipelineQueue,
  applyContentOverrides
};
