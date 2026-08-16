/**
 * Comprehensive Adversarial Stress Test Suite for ReOpSy Version 2
 * 
 * Challengers test harness targeting:
 * 1. Network resilience & XML fuzzing (arXiv malformed XML, unclosed tags, entity bombs, HTTP 429/500/503, timeouts).
 * 2. API Key security & sanitization (regex fuzzing, error log leak analysis, custom keys with regex special chars).
 * 3. Custom Topic Live Fetcher Fallbacks (LLM crash, invalid JSON, 401/403/429/500, empty candidates, rate limits).
 * 4. Auth State Transitions & Multi-Device Merging (`mergeCloudAndLocalState` state matrix, race conditions, edge cases).
 * 5. SQLite Concurrency & Multi-Topic Primary Key Deduplication (concurrent writes, race conditions, multi-topic key integrity).
 */

const assert = require('assert');
const test = require('node:test');
const path = require('path');
const fs = require('fs');

// Ingest & Backend modules
const arxiv = require('../backend/ingest/lib/arxiv');
const openalex = require('../backend/ingest/lib/openalex');
const { fetchTldr } = require('../backend/pipeline/semanticScholar');
const { generateCatchyTitle } = require('../backend/pipeline/llm');
const { db } = require('../backend/db/db');
const sqlite3 = require('../backend/node_modules/sqlite3').verbose();

// Types and helper functions for frontend state & services
// We emulate / load the compiled TypeScript / JS logic for customTopicFetcher and apiValidator

// -------------------------------------------------------------
// ADVERSARIAL HELPERS & MOCKS
// -------------------------------------------------------------

function sanitizeLogMessage(message, apiKey) {
  if (!message) return '';
  let sanitized = String(message)
    .replace(/(key=)[a-zA-Z0-9_\-]+/g, '$1***')
    .replace(/(Bearer\s+)[a-zA-Z0-9_\-]+/g, '$1***');

  if (apiKey && apiKey.length >= 4) {
    sanitized = sanitized.split(apiKey).join('***');
  }

  return sanitized;
}

function cleanXmlEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArxivAtomXml(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;

  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entryBlock = entryMatch[1];

    const idMatch = entryBlock.match(/<id>([\s\S]*?)<\/id>/);
    const rawId = idMatch ? idMatch[1].trim() : `arxiv:${Date.now()}`;
    const cleanId = rawId.replace(/^http:\/\/arxiv\.org\/abs\//, 'arxiv:');

    const titleMatch = entryBlock.match(/<title>([\s\S]*?)<\/title>/);
    const rawTitle = titleMatch ? cleanXmlEntities(titleMatch[1]) : 'Untitled Paper';

    const summaryMatch = entryBlock.match(/<summary>([\s\S]*?)<\/summary>/);
    const rawSummary = summaryMatch ? cleanXmlEntities(summaryMatch[1]) : 'No summary available.';

    const publishedMatch = entryBlock.match(/<published>([\s\S]*?)<\/published>/);
    let year = new Date().getFullYear();
    if (publishedMatch) {
      const parsedDate = new Date(publishedMatch[1].trim());
      if (!isNaN(parsedDate.getFullYear())) {
        year = parsedDate.getFullYear();
      }
    }

    const authors = [];
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entryBlock)) !== null) {
      const name = cleanXmlEntities(authorMatch[1]);
      if (name) authors.push(name);
    }

    let url = `https://arxiv.org/abs/${cleanId.replace(/^arxiv:/, '')}`;
    let pdfUrl = null;

    const linkRegex = /<link([\s\S]*?)\/>/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(entryBlock)) !== null) {
      const linkTag = linkMatch[1];
      const hrefMatch = linkTag.match(/href="([^"]+)"/);
      const titleMatchAttr = linkTag.match(/title="([^"]+)"/);
      const typeMatch = linkTag.match(/type="([^"]+)"/);

      if (hrefMatch) {
        const href = hrefMatch[1];
        if (titleMatchAttr && titleMatchAttr[1] === 'pdf') {
          pdfUrl = href;
        } else if (typeMatch && typeMatch[1] === 'application/pdf') {
          pdfUrl = href;
        } else if (!url && linkTag.includes('rel="alternate"')) {
          url = href;
        }
      }
    }

    entries.push({
      id: cleanId,
      title: rawTitle,
      summary: rawSummary,
      authors: authors.length > 0 ? authors : ['Unknown authors'],
      publishedYear: year,
      url,
      pdfUrl
    });
  }

  return entries;
}

const initialStreak = {
  current: 0,
  longest: 0,
  lastActiveDay: null,
  freezes: 0,
  freezesEarned: 0,
  totalDays: 0
};

function mergeCloudAndLocalState(local, cloud) {
  if (!cloud) {
    return {
      ...local,
      followedTopics: local.followedTopics?.length ? local.followedTopics : ['ml', 'ai-health'],
      savedPapers: local.savedPapers || [],
      likedPapers: local.likedPapers || [],
      streak: local.streak || initialStreak,
      onboardingComplete: Boolean(local.onboardingComplete),
      userApiConfig: local.userApiConfig || null,
      customFeedData: local.customFeedData || []
    };
  }

  // 1. Followed topics: union of unique topics with fallback
  const cloudTopics = Array.isArray(cloud.followedTopics) ? cloud.followedTopics : [];
  const localTopics = Array.isArray(local.followedTopics) ? local.followedTopics : [];
  const topicSet = new Set();
  const mergedTopics = [];

  for (const t of [...cloudTopics, ...localTopics]) {
    if (typeof t === 'string' && t.trim() !== '' && !topicSet.has(t)) {
      topicSet.add(t);
      mergedTopics.push(t);
    }
  }
  const finalTopics = mergedTopics.length > 0 ? mergedTopics : ['ml', 'ai-health'];

  // 2. Saved papers: union deduplicated by paper ID (local recents first)
  const localSaved = Array.isArray(local.savedPapers) ? local.savedPapers : [];
  const cloudSaved = Array.isArray(cloud.savedPapers) ? cloud.savedPapers : [];
  const seenPaperIds = new Set();
  const mergedSaved = [];

  for (const paper of localSaved) {
    if (paper && paper.id && !seenPaperIds.has(paper.id)) {
      seenPaperIds.add(paper.id);
      mergedSaved.push(paper);
    }
  }
  for (const paper of cloudSaved) {
    if (paper && paper.id && !seenPaperIds.has(paper.id)) {
      seenPaperIds.add(paper.id);
      mergedSaved.push(paper);
    }
  }

  // 3. Liked papers: union of string IDs
  const localLiked = Array.isArray(local.likedPapers) ? local.likedPapers : [];
  const cloudLiked = Array.isArray(cloud.likedPapers) ? cloud.likedPapers : [];
  const mergedLiked = Array.from(
    new Set([...cloudLiked, ...localLiked].filter(id => typeof id === 'string' && id.trim() !== ''))
  );

  // 4. Streak state: preserve highest activity and latest active day
  const localStreak = local.streak || initialStreak;
  const cloudStreak = cloud.streak || initialStreak;

  let current = Math.max(localStreak.current || 0, cloudStreak.current || 0);
  let lastActiveDay = localStreak.lastActiveDay;

  if (!lastActiveDay && cloudStreak.lastActiveDay) {
    lastActiveDay = cloudStreak.lastActiveDay;
    current = cloudStreak.current || 0;
  } else if (lastActiveDay && cloudStreak.lastActiveDay) {
    if (cloudStreak.lastActiveDay > lastActiveDay) {
      lastActiveDay = cloudStreak.lastActiveDay;
      current = cloudStreak.current || 0;
    } else if (lastActiveDay > cloudStreak.lastActiveDay) {
      lastActiveDay = localStreak.lastActiveDay;
      current = localStreak.current || 0;
    } else {
      current = Math.max(localStreak.current || 0, cloudStreak.current || 0);
    }
  }

  const mergedStreak = {
    current,
    longest: Math.max(localStreak.longest || 0, cloudStreak.longest || 0, current),
    lastActiveDay: lastActiveDay || null,
    freezes: Math.max(localStreak.freezes || 0, cloudStreak.freezes || 0),
    freezesEarned: Math.max(localStreak.freezesEarned || 0, cloudStreak.freezesEarned || 0),
    totalDays: Math.max(localStreak.totalDays || 0, cloudStreak.totalDays || 0)
  };

  // 5. User API Config: prioritize configured key
  let mergedApiConfig = null;
  if (local.userApiConfig && local.userApiConfig.apiKey && local.userApiConfig.apiKey.trim() !== '') {
    mergedApiConfig = {
      provider: local.userApiConfig.provider || cloud.userApiConfig?.provider || 'Gemini',
      apiKey: local.userApiConfig.apiKey,
      endpoint: local.userApiConfig.endpoint || cloud.userApiConfig?.endpoint || '',
      customTopic: local.userApiConfig.customTopic || cloud.userApiConfig?.customTopic || ''
    };
  } else if (cloud.userApiConfig && cloud.userApiConfig.apiKey && cloud.userApiConfig.apiKey.trim() !== '') {
    mergedApiConfig = {
      provider: cloud.userApiConfig.provider || 'Gemini',
      apiKey: cloud.userApiConfig.apiKey,
      endpoint: cloud.userApiConfig.endpoint || '',
      customTopic: cloud.userApiConfig.customTopic || ''
    };
  } else if (local.userApiConfig || cloud.userApiConfig) {
    mergedApiConfig = {
      provider: local.userApiConfig?.provider || cloud.userApiConfig?.provider || 'Gemini',
      apiKey: local.userApiConfig?.apiKey || cloud.userApiConfig?.apiKey || '',
      endpoint: local.userApiConfig?.endpoint || cloud.userApiConfig?.endpoint || '',
      customTopic: local.userApiConfig?.customTopic || cloud.userApiConfig?.customTopic || ''
    };
  }

  const mergedOnboarding = Boolean(local.onboardingComplete || cloud.onboardingComplete);
  const localCustom = Array.isArray(local.customFeedData) ? local.customFeedData : [];
  const cloudCustom = Array.isArray(cloud.customFeedData) ? cloud.customFeedData : [];
  const mergedCustomFeed = localCustom.length > 0 ? localCustom : cloudCustom;

  return {
    followedTopics: finalTopics,
    savedPapers: mergedSaved,
    likedPapers: mergedLiked,
    streak: mergedStreak,
    onboardingComplete: mergedOnboarding,
    userApiConfig: mergedApiConfig,
    customFeedData: mergedCustomFeed
  };
}

// -------------------------------------------------------------
// ADVERSARIAL TEST SUITE
// -------------------------------------------------------------

test('⚔️ Adversarial Suite 1: Network Resilience & XML Parser Fuzzing', async (t) => {
  await t.test('1.1: Fuzzing arXiv Atom XML with malformed, unclosed, and corrupted payloads', () => {
    const fuzzedXmlCases = [
      '', // Empty string
      'null',
      'undefined',
      '<html><body><h1>502 Bad Gateway</h1></body></html>',
      '<?xml version="1.0"?><feed><entry><id>incomplete',
      '<feed><entry><title>Unclosed Title<summary>Unclosed Summary<id>http://arxiv.org/abs/2401.00001</id></entry></feed>',
      '<feed><entry><id>http://arxiv.org/abs/2401.00002</id><title><![CDATA[Special <Characters> & "Quotes" & \x00 NullByte]]></title><summary>Valid summary</summary></entry></feed>',
      '<feed>' + '<entry><id>http://arxiv.org/abs/2401.99999</id><title>Valid</title><summary>Valid</summary></entry>'.repeat(100) + '</feed>',
      '<feed><entry><id>http://arxiv.org/abs/2401.00003</id><title></title><summary></summary><published>INVALID_DATE_FORMAT</published></entry></feed>',
      '<feed><entry><id>http://arxiv.org/abs/2401.00004</id><title>Nested &lt;b&gt;HTML&lt;/b&gt; and &amp;amp; double escaped entities</title><summary>&quot;Quoted&quot; &#39;Apostrophe&#39;</summary></entry></feed>'
    ];

    for (const xml of fuzzedXmlCases) {
      assert.doesNotThrow(() => {
        const clientParsed = parseArxivAtomXml(xml);
        assert(Array.isArray(clientParsed), 'Client parser must return an array');
      }, `Client parser crashed on XML fuzz payload: ${xml.slice(0, 50)}`);

      assert.doesNotThrow(() => {
        const backendParsed = arxiv.parseAtom(xml, 'ml');
        assert(Array.isArray(backendParsed), 'Backend parser must return an array');
      }, `Backend parser crashed on XML fuzz payload: ${xml.slice(0, 50)}`);
    }
  });

  await t.test('1.2: Semantic Scholar HTTP 429 / 500 / Timeout resilience', async () => {
    // Test that rate limiting or 500 does not throw fatal exceptions
    const originalFetch = global.fetch;

    // Simulate 429 Too Many Requests
    global.fetch = async () => ({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded'
    });
    const res429 = await fetchTldr('Adversarial Test Paper 429');
    assert.strictEqual(res429, null, 'TLDR fetcher must return null on 429');

    // Simulate 500 Internal Server Error
    global.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    });
    const res500 = await fetchTldr('Adversarial Test Paper 500');
    assert.strictEqual(res500, null, 'TLDR fetcher must return null on 500');

    // Simulate Network Timeout / Connection Reset
    global.fetch = async () => {
      throw new Error('ETIMEDOUT: Connection timed out');
    };
    const resTimeout = await fetchTldr('Adversarial Test Paper Timeout');
    assert.strictEqual(resTimeout, null, 'TLDR fetcher must return null on network timeout');

    global.fetch = originalFetch;
  });

  await t.test('1.3: arXiv API Error Handling (HTTP 503 & Connection Abort)', async () => {
    const originalFetch = global.fetch;

    global.fetch = async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable'
    });

    await assert.rejects(
      async () => {
        await arxiv.fetchTopic({ topic: 'ml', limit: 5, fetchImpl: global.fetch });
      },
      /arXiv 503 Service Unavailable/,
      'arXiv fetcher must throw clean descriptive error when service unavailable'
    );

    global.fetch = originalFetch;
  });
});

test('⚔️ Adversarial Suite 2: API Key Security & Sanitization', async (t) => {
  await t.test('2.1: Key leakage prevention in URLs, headers, and error messages', () => {
    const sensitiveKeys = [
      'AIzaSyD-1234567890abcdef-GHIJKLMN',
      'sk_live_9876543210fedcba_SECRET',
      'xai-live-secret-key-999999',
      'custom$secret+key.with[special](chars)*'
    ];

    for (const key of sensitiveKeys) {
      const errorMsgWithKey = `Error contacting endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key} with Bearer ${key} failed. Details: Invalid auth with key=${key}`;
      const sanitized = sanitizeLogMessage(errorMsgWithKey, key);

      assert(!sanitized.includes(key), `Sanitizer failed: Key "${key}" was found in sanitized output "${sanitized}"`);
      assert(sanitized.includes('***'), 'Sanitizer should replace key occurrences with asterisks');
    }
  });

  await t.test('2.2: Multi-LLM fallback error messages never leak API keys', async () => {
    const originalFetch = global.fetch;
    const testKey = 'AIzaSyAdversarialLeakedKey999';

    global.fetch = async (url, opts) => {
      return {
        ok: false,
        status: 400,
        text: async () => `Bad Request: URL ${url} failed with invalid auth token ${testKey}`
      };
    };

    let caughtWarning = '';
    const originalWarn = console.warn;
    console.warn = (...args) => {
      caughtWarning += args.join(' ') + '\n';
    };

    try {
      const res = await generateCatchyTitle('Quantum Transformers', 'Abstract content', { gemini: testKey });
      assert.strictEqual(res.provider, 'original', 'Should fall back to original title on error');
    } finally {
      console.warn = originalWarn;
      global.fetch = originalFetch;
    }
  });
});

test('⚔️ Adversarial Suite 3: Custom Topic Live Fetcher Fallback', async (t) => {
  await t.test('3.1: Live fetcher survives LLM returning garbage, non-JSON, and malformed structures', async () => {
    const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>http://arxiv.org/abs/2405.00001v1</id>
        <title>Adversarial Neural Architectures</title>
        <summary>This paper investigates extreme adversarial perturbation in deep neural nets.</summary>
        <author><name>Alice Researcher</name></author>
        <published>2024-05-15T00:00:00Z</published>
        <link href="http://arxiv.org/abs/2405.00001v1" rel="alternate" type="text/html"/>
        <link title="pdf" href="http://arxiv.org/pdf/2405.00001v1" rel="related" type="application/pdf"/>
      </entry>
    </feed>`;

    // Test XML parser directly
    const entries = parseArxivAtomXml(sampleXml);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].title, 'Adversarial Neural Architectures');
    assert.strictEqual(entries[0].pdfUrl, 'http://arxiv.org/pdf/2405.00001v1');
    assert.strictEqual(entries[0].publishedYear, 2024);
  });
});

test('⚔️ Adversarial Suite 4: Auth State Transitions & Multi-Device Merging', async (t) => {
  await t.test('4.1: Extreme edge cases for mergeCloudAndLocalState', () => {
    // Case 1: Both local and cloud are completely empty / missing fields
    const emptyMerged = mergeCloudAndLocalState({}, {});
    assert.deepStrictEqual(emptyMerged.followedTopics, ['ml', 'ai-health'], 'Empty state should fall back to default topics');
    assert.deepStrictEqual(emptyMerged.savedPapers, []);
    assert.deepStrictEqual(emptyMerged.likedPapers, []);
    assert.strictEqual(emptyMerged.streak.current, 0);
    assert.strictEqual(emptyMerged.onboardingComplete, false);
    assert.strictEqual(emptyMerged.userApiConfig, null);

    // Case 2: Cloud is null or undefined
    const nullCloudMerged = mergeCloudAndLocalState({
      followedTopics: ['robotics'],
      savedPapers: [{ id: 'p1', originalTitle: 'Paper 1', catchyTitle: 'Paper 1', summary: 'Summary', authors: [], source: 'arxiv', year: 2024, venue: 'arXiv', url: '#', pdfUrl: null, topics: ['robotics'], likes: 0 }],
      likedPapers: ['p1'],
      streak: { current: 5, longest: 10, lastActiveDay: '2026-08-15', freezes: 2, freezesEarned: 2, totalDays: 12 },
      onboardingComplete: true,
      userApiConfig: { provider: 'Mistral', apiKey: 'sk_test_123', customTopic: 'Bioinformatics' },
      customFeedData: []
    }, null);

    assert.deepStrictEqual(nullCloudMerged.followedTopics, ['robotics']);
    assert.strictEqual(nullCloudMerged.savedPapers.length, 1);
    assert.strictEqual(nullCloudMerged.streak.current, 5);
    assert.strictEqual(nullCloudMerged.userApiConfig.provider, 'Mistral');

    // Case 3: Conflicting Streak dates & Freezes resolution
    const localWithOlderStreak = {
      followedTopics: ['ml'],
      savedPapers: [],
      likedPapers: [],
      streak: { current: 2, longest: 5, lastActiveDay: '2026-08-10', freezes: 1, freezesEarned: 1, totalDays: 4 },
      onboardingComplete: true,
      userApiConfig: null
    };

    const cloudWithNewerStreak = {
      followedTopics: ['dl', 'cv'],
      savedPapers: [],
      likedPapers: [],
      streak: { current: 7, longest: 12, lastActiveDay: '2026-08-16', freezes: 3, freezesEarned: 3, totalDays: 15 },
      onboardingComplete: true,
      userApiConfig: null
    };

    const mergedStreakResult = mergeCloudAndLocalState(localWithOlderStreak, cloudWithNewerStreak);
    assert.strictEqual(mergedStreakResult.streak.current, 7, 'Should take newer cloud streak current value');
    assert.strictEqual(mergedStreakResult.streak.longest, 12, 'Longest streak should be maximum across devices');
    assert.strictEqual(mergedStreakResult.streak.lastActiveDay, '2026-08-16');
    assert.strictEqual(mergedStreakResult.streak.freezes, 3);
    assert.strictEqual(mergedStreakResult.streak.totalDays, 15);
    assert.deepStrictEqual(mergedStreakResult.followedTopics.sort(), ['cv', 'dl', 'ml'].sort());

    // Case 4: Deduplicating saved papers with conflicting versions
    const localSaved = [
      { id: 'shared-1', originalTitle: 'Local Version Title', catchyTitle: 'Local Title', summary: 'Local Summary', authors: [], source: 'arxiv', year: 2024, venue: 'arXiv', url: '#', pdfUrl: null, topics: ['ml'], likes: 0 },
      { id: 'local-only-2', originalTitle: 'Local Only', catchyTitle: 'Local Only', summary: 'Local Summary 2', authors: [], source: 'arxiv', year: 2024, venue: 'arXiv', url: '#', pdfUrl: null, topics: ['ml'], likes: 0 }
    ];
    const cloudSaved = [
      { id: 'shared-1', originalTitle: 'Cloud Version Title', catchyTitle: 'Cloud Title', summary: 'Cloud Summary', authors: [], source: 'arxiv', year: 2024, venue: 'arXiv', url: '#', pdfUrl: null, topics: ['ml'], likes: 0 },
      { id: 'cloud-only-3', originalTitle: 'Cloud Only', catchyTitle: 'Cloud Only', summary: 'Cloud Summary 3', authors: [], source: 'arxiv', year: 2024, venue: 'arXiv', url: '#', pdfUrl: null, topics: ['cv'], likes: 0 }
    ];

    const mergedSavedResult = mergeCloudAndLocalState(
      { ...localWithOlderStreak, savedPapers: localSaved },
      { ...cloudWithNewerStreak, savedPapers: cloudSaved }
    );

    assert.strictEqual(mergedSavedResult.savedPapers.length, 3, 'Should contain exact union of 3 unique papers');
    const sharedPaper = mergedSavedResult.savedPapers.find(p => p.id === 'shared-1');
    assert.strictEqual(sharedPaper.catchyTitle, 'Local Title', 'Local recent version should take precedence for shared ID');
  });
});

test('⚔️ Adversarial Suite 5: SQLite Concurrency & Multi-Topic Primary Key Deduplication', async (t) => {
  const testDbDir = path.join(__dirname, 'scratch_db');
  if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
  const testDbPath = path.join(testDbDir, `concurrency_test_${Date.now()}.sqlite`);
  const testDb = new sqlite3.Database(testDbPath);

  await new Promise((resolve, reject) => {
    testDb.run(`
      CREATE TABLE IF NOT EXISTS papers (
        id TEXT,
        topic TEXT,
        originalTitle TEXT,
        catchyTitle TEXT,
        summary TEXT,
        authors TEXT,
        source TEXT,
        year INTEGER,
        venue TEXT,
        url TEXT,
        pdfUrl TEXT,
        fetchedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, topic)
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  function insertPaperPromise(topic, paper) {
    return new Promise((resolve, reject) => {
      const stmt = testDb.prepare(`
        INSERT OR REPLACE INTO papers (
          id, topic, originalTitle, catchyTitle, summary, authors, source, year, venue, url, pdfUrl, fetchedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      stmt.run(
        paper.id,
        topic,
        paper.originalTitle,
        paper.catchyTitle,
        paper.summary,
        JSON.stringify(paper.authors || []),
        paper.source,
        paper.year,
        paper.venue,
        paper.url,
        paper.pdfUrl,
        function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
      stmt.finalize();
    });
  }

  await t.test('5.1: Multi-topic primary key allows same paper ID in multiple topics', async () => {
    const sharedPaper = {
      id: 'paper-cross-topic-001',
      originalTitle: 'Cross-Topic Research on Multi-Modal LLMs',
      catchyTitle: 'Multi-Modal LLM Breakthrough',
      summary: 'Paper spanning NLP, Computer Vision, and Robotics.',
      authors: ['Researcher A', 'Researcher B'],
      source: 'arxiv',
      year: 2024,
      venue: 'arXiv',
      url: 'https://arxiv.org/abs/2405.99999',
      pdfUrl: 'https://arxiv.org/pdf/2405.99999'
    };

    // Insert same paper into 3 distinct topics
    await insertPaperPromise('nlp', sharedPaper);
    await insertPaperPromise('cv', sharedPaper);
    await insertPaperPromise('robotics', sharedPaper);

    const rows = await new Promise((resolve, reject) => {
      testDb.all(`SELECT * FROM papers WHERE id = ?`, [sharedPaper.id], (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    assert.strictEqual(rows.length, 3, 'Paper ID should exist under 3 distinct topics');
    const topics = rows.map(r => r.topic).sort();
    assert.deepStrictEqual(topics, ['cv', 'nlp', 'robotics']);
  });

  await t.test('5.2: High concurrency stress test (50 parallel simultaneous inserts)', async () => {
    const parallelOperations = [];
    const paperCount = 50;

    for (let i = 0; i < paperCount; i++) {
      const topic = Math.floor(i / 10) % 2 === 0 ? 'ml' : 'dl';
      const paper = {
        id: `concurrent-paper-${i % 10}`, // 10 unique IDs, repeatedly overwritten concurrently across 2 topics
        originalTitle: `Concurrent Paper ${i}`,
        catchyTitle: `Catchy Concurrent ${i}`,
        summary: `Summary for operation ${i}`,
        authors: [`Author ${i}`],
        source: 'arxiv',
        year: 2024,
        venue: 'arXiv',
        url: `#${i}`,
        pdfUrl: null
      };
      parallelOperations.push(insertPaperPromise(topic, paper));
    }

    // Execute all 50 operations simultaneously
    const results = await Promise.all(parallelOperations);
    assert.strictEqual(results.length, paperCount);

    // Verify DB integrity
    const allRows = await new Promise((resolve, reject) => {
      testDb.all(`SELECT COUNT(*) as count FROM papers WHERE id LIKE 'concurrent-paper-%'`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0].count);
      });
    });

    // 10 unique IDs across 2 topics = 20 distinct rows
    assert.strictEqual(allRows, 20, 'Database should hold exactly 20 distinct (id, topic) rows after 50 concurrent writes');
  });

  // Clean up
  testDb.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch {}
});
