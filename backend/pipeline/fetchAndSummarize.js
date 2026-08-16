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
const { insertPaper, getLatestPapersForTopic, db } = require('../db/db');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAndSummarize(options = {}) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    loadEnv(envPath);
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

  const feedData = {
    generatedAt: new Date().toISOString(),
    topics: {}
  };

  let topicsProcessed = 0;
  let totalPapers = 0;

  for (const topic of ALL_SLUGS) {
    console.log(`\nProcessing topic: ${topic}`);
    let collected = [];

    // 1. Fetch OpenAlex
    try {
      console.log(`  Fetching OpenAlex for ${topic}...`);
      const oaPapers = await openalex.fetchTopic({ topic, limit: limitPerSource, fromDate });
      collected.push(...oaPapers);
    } catch (e) {
      console.error(`  OpenAlex failed: ${e.message}`);
    }

    // 2. Fetch arXiv
    try {
      console.log(`  Fetching arXiv for ${topic}...`);
      const arxivPapers = await arxiv.fetchTopic({ topic, limit: limitPerSource });
      collected.push(...arxivPapers);
      await delay(3000); // polite rate limit
    } catch (e) {
      console.error(`  arXiv failed: ${e.message}`);
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
          summary = "No abstract available.";
        }

        const llmRes = await generateCatchyTitle(p.title, summary, apiKeys);
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
       totalPapers += latestPapers.length;
    } else {
      totalPapers += validPapers.length;
    }
  }

  if (dryRun) {
    console.log('\nDRY RUN COMPLETE.');
    return { success: true, topicsProcessed, totalPapers };
  }

  // Write to frontend data folder
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(feedData, null, 2), 'utf8');
  console.log(`\n✅ Feed generated at ${outPath}`);
  
  return { success: true, topicsProcessed, totalPapers };
}

if (require.main === module) {
  fetchAndSummarize({ dryRun: process.argv.includes('--dry') })
    .then(() => {
      if (!process.argv.includes('--dry')) {
        db.close();
      }
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  fetchAndSummarize
};
