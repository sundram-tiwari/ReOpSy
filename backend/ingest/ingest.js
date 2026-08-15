#!/usr/bin/env node
'use strict';

/**
 * ReOpSy nightly ingest.
 *
 *   node ingest/ingest.js --topics ml,nlp --limit 40
 *   node ingest/ingest.js --dry --topics ml --limit 5      # prints cards, no DB
 *   node ingest/ingest.js --days 14                        # widen the window
 *
 * Exit codes: 0 ok, 1 failure. The GitHub Action relies on that.
 */

const fs = require('fs');
const path = require('path');

const openalex = require('./lib/openalex');
const arxiv = require('./lib/arxiv');
const { dedupe } = require('./lib/dedupe');
const { resolveTopics, TOPICS } = require('./lib/topics');
const { Db } = require('./lib/db');
const { wordCount } = require('./lib/text');
const { MAX_WORDS } = require('./lib/summarize');

// ---------------------------------------------------------------------------
// .env loading (no dotenv dependency)
// ---------------------------------------------------------------------------
function loadEnv(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* no .env — env vars may come from the CI runner instead */
  }
}

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { dry: false, topics: null, limit: 30, days: 30, source: 'both' };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry' || a === '-n') args.dry = true;
    else if (a === '--topics' || a === '-t') args.topics = argv[++i];
    else if (a === '--limit' || a === '-l') args.limit = Number(argv[++i]) || 30;
    else if (a === '--days' || a === '-d') args.days = Number(argv[++i]) || 30;
    else if (a === '--source' || a === '-s') args.source = String(argv[++i] || 'both');
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const HELP = `
ReOpSy ingest

  --topics, -t   comma list or "all"   (default: all)   ${Object.keys(TOPICS).join(', ')}
  --limit,  -l   records per source per topic (default: 30)
  --days,   -d   only consider papers published in the last N days (default: 30)
  --source, -s   openalex | arxiv | both (default: both)
  --dry,    -n   print sample cards, write nothing
  --help,   -h   this text
`;

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Last line of defence before anything reaches the database.
 * A record that fails any of these is dropped, not repaired: a card that shows
 * an empty summary or an unusable link is worse than one fewer card.
 */
function validate(paper) {
  const problems = [];
  if (!paper.id) problems.push('missing id');
  if (!paper.title) problems.push('missing title');
  if (!paper.url || !/^https?:\/\//.test(paper.url)) problems.push('bad url');
  if (!paper.summary) problems.push('empty summary');
  if (paper.summary && wordCount(paper.summary) > MAX_WORDS + 2) problems.push('summary over budget');
  if (!paper.title_key) problems.push('missing title_key');
  if (paper.abstract && !paper.license_ok) problems.push('abstract present without open licence');
  return problems;
}

function printCard(p, i) {
  const rule = '─'.repeat(64);
  log(`\n${rule}\n[${i + 1}] ${p.title}`);
  log(`    ${(p.authors || []).slice(0, 3).join(', ')}${(p.authors || []).length > 3 ? ' et al.' : ''}`);
  log(`    ${p.venue || '—'}${p.year ? ` · ${p.year}` : ''} · ${p.topics.join(', ') || 'no topic'}`);
  log(`    licence: ${p.license || 'unknown'} ${p.license_ok ? '(abstract shown)' : '(summary only)'}`);
  log(`\n    ${p.summary}`);
  log(`\n    ${wordCount(p.summary)} words · ${p.url}`);
}

// ---------------------------------------------------------------------------
async function main() {
  loadEnv(path.join(__dirname, '..', '.env'));

  const args = parseArgs(process.argv.slice(2));
  if (args.help) { log(HELP); return 0; }

  let topics;
  try {
    topics = resolveTopics(args.topics);
  } catch (err) {
    warn(String(err.message));
    return 1;
  }

  const fromDate = isoDaysAgo(args.days);
  const mailto = process.env.OPENALEX_MAILTO || null;

  log(`ReOpSy ingest · topics: ${topics.join(', ')} · limit ${args.limit}/source · since ${fromDate}${args.dry ? ' · DRY RUN' : ''}`);

  let db = null;
  let runId = null;
  if (!args.dry) {
    db = new Db({
      url: process.env.SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_KEY,
    });
    runId = await db.startRun(topics);
  }

  const collected = [];
  let fetched = 0;
  const failures = [];

  for (const topic of topics) {
    if (args.source === 'openalex' || args.source === 'both') {
      try {
        const rows = await openalex.fetchTopic({ topic, limit: args.limit, fromDate, mailto });
        fetched += rows.length;
        collected.push(...rows);
        log(`  openalex/${topic}: ${rows.length}`);
      } catch (err) {
        failures.push(`openalex/${topic}: ${err.message}`);
        warn(`  openalex/${topic}: FAILED — ${err.message}`);
      }
    }

    if (args.source === 'arxiv' || args.source === 'both') {
      try {
        const rows = await arxiv.fetchTopic({ topic, limit: args.limit });
        fetched += rows.length;
        collected.push(...rows);
        log(`  arxiv/${topic}: ${rows.length}`);
        // arXiv asks for ~3s between programmatic requests. Be a good citizen.
        await new Promise((r) => setTimeout(r, 3000));
      } catch (err) {
        failures.push(`arxiv/${topic}: ${err.message}`);
        warn(`  arxiv/${topic}: FAILED — ${err.message}`);
      }
    }
  }

  const { papers: deduped, removed } = dedupe(collected);

  const valid = [];
  let skipped = 0;
  for (const p of deduped) {
    const problems = validate(p);
    if (problems.length) {
      skipped += 1;
      warn(`  skip ${p.id || '?'}: ${problems.join('; ')}`);
    } else {
      valid.push(p);
    }
  }

  log(`\nfetched ${fetched} · merged ${removed} duplicates · dropped ${skipped} invalid · ${valid.length} ready`);

  if (args.dry) {
    valid.slice(0, 3).forEach(printCard);
    if (valid.length === 0) warn('\nNothing came back. Check your network, or widen --days.');
    log('');
    return failures.length && valid.length === 0 ? 1 : 0;
  }

  let written = 0;
  try {
    written = await db.upsertPapers(valid);
    log(`upserted ${written} rows`);
    await db.finishRun(runId, {
      fetched, inserted: written, updated: 0, skipped, ok: true,
      error: failures.length ? failures.join(' | ').slice(0, 2000) : null,
    });
  } catch (err) {
    await db.finishRun(runId, {
      fetched, skipped, ok: false, error: String(err.message).slice(0, 2000),
    });
    throw err;
  }

  // A run where every single source failed is a failure even if the DB write
  // of zero rows "succeeded" — otherwise a broken nightly job looks green.
  if (valid.length === 0 && failures.length) return 1;
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('\nIngest failed:', err && err.stack ? err.stack : err);
      process.exit(1);
    });
}

module.exports = { parseArgs, validate, isoDaysAgo, loadEnv };
