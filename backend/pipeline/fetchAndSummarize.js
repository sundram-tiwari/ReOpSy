#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { TOPICS, ALL_SLUGS } = require('../ingest/lib/topics');
const openalex = require('../ingest/lib/openalex');
const arxiv = require('../ingest/lib/arxiv');
const { dedupe } = require('../ingest/lib/dedupe');
const { loadEnv, isoDaysAgo } = require('../ingest/ingest');
const { summarizeBatch } = require('./gemini');
const { summarize: fallbackSummarize } = require('../ingest/lib/summarize');
const { insertPaper, getLatestPapersForTopic, db } = require('../db/db');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  loadEnv(path.join(__dirname, '..', '.env'));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY not set. Falling back to extractive summarizer.');
  }

  const dryRun = process.argv.includes('--dry');
  const limitPerSource = 5; // Fetch up to 5 from each, dedupe, then take top 10
  const fromDate = isoDaysAgo(30);

  const feedData = {
    generatedAt: new Date().toISOString(),
    topics: {}
  };

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

    // 3. Dedupe
    const { papers: deduped } = dedupe(collected);
    const validPapers = deduped.filter(p => p.abstract && p.title && p.url).slice(0, 10);
    console.log(`  Fetched ${validPapers.length} valid papers for ${topic}.`);

    // 4. Summarize (Gemini Batching)
    if (validPapers.length > 0 && !dryRun) {
      // Process in batches of 5
      for (let i = 0; i < validPapers.length; i += 5) {
        const batch = validPapers.slice(i, i + 5);
        console.log(`  Summarizing batch ${i / 5 + 1} (${batch.length} papers)...`);
        
        let aiResults = null;
        if (apiKey) {
          aiResults = await summarizeBatch(batch, apiKey);
          if (aiResults) await delay(4000); // 15 RPM limit approx 4s between calls
        }

        for (let j = 0; j < batch.length; j++) {
          const p = batch[j];
          let catchyTitle = `[DUMMY TITLE] ${p.title.substring(0, 30)}...`;
          let summary = `[DUMMY SUMMARY for Testing Purposes] This is a placeholder summary because the Gemini API quota was exceeded. The original paper is titled: ${p.title}. We are using this dummy text to test the UI layout and scrolling behavior.`;

          if (aiResults && aiResults[j]) {
            catchyTitle = aiResults[j].catchyTitle || p.title;
            summary = aiResults[j].summary || summary;
          }

          const paperRecord = {
            id: p.id,
            originalTitle: p.title,
            catchyTitle,
            summary,
            authors: p.authors || [],
            source: p.source,
            year: p.year,
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
    }

    // 5. Generate Frontend Feed from DB
    if (!dryRun) {
       const latestPapers = await getLatestPapersForTopic(topic, 10);
       feedData.topics[topic] = latestPapers;
    }
  }

  if (dryRun) {
    console.log('\nDRY RUN COMPLETE.');
    return;
  }

  // Write to frontend data folder
  const outPath = path.join(__dirname, '..', '..', 'app', 'src', 'data', 'dailyFeed.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(feedData, null, 2), 'utf8');
  console.log(`\n✅ Feed generated at ${outPath}`);
  
  // Close DB connection
  db.close();
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
