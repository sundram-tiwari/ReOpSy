/**
 * Deep Adversarial Edge Cases and Chaos Stress Testing for ReOpSy Version 2
 */

const assert = require('assert');
const test = require('node:test');
const path = require('path');
const fs = require('fs');

const { db } = require('../backend/db/db');
const sqlite3 = require('../backend/node_modules/sqlite3').verbose();

// -------------------------------------------------------------
// ADVERSARIAL HELPERS
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

const initialStreak = {
  current: 0,
  longest: 0,
  lastActiveDay: null,
  freezes: 0,
  freezesEarned: 0,
  totalDays: 0
};

const DEFAULT_FOLLOWED_TOPICS = ['ai-mental-health', 'autism-diagnosis', 'blockchain', 'quantum-communication', 'surveillance-anomaly-detection'];

function mergeCloudAndLocalState(local, cloud) {
  if (!cloud) {
    return {
      ...local,
      followedTopics: local.followedTopics?.length ? local.followedTopics : DEFAULT_FOLLOWED_TOPICS,
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
  const finalTopics = mergedTopics.length > 0 ? mergedTopics : DEFAULT_FOLLOWED_TOPICS;

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

async function synthesizeWithLlmMock(title, summary, apiConfig, mockResponse) {
  const { apiKey } = apiConfig;
  if (!apiKey || apiKey.trim() === '') {
    return { catchyTitle: title, summary };
  }

  try {
    if (mockResponse.shouldThrow) {
      throw new Error(mockResponse.errorMessage || 'Network connection failed');
    }
    if (mockResponse.status && mockResponse.status !== 200) {
      throw new Error(`HTTP ${mockResponse.status}: ${mockResponse.statusText || 'Error'}`);
    }
    if (typeof mockResponse.text === 'string') {
      const parsed = JSON.parse(mockResponse.text);
      return {
        catchyTitle: parsed.catchyTitle || title,
        summary: parsed.summary || summary
      };
    }
  } catch (err) {
    // Fallback caught
  }

  return { catchyTitle: title, summary };
}

// -------------------------------------------------------------
// ADVERSARIAL EDGE CASE TESTS
// -------------------------------------------------------------

test('⚔️ Adversarial Suite: Regex Metacharacters in API Keys & Sanitization', async (t) => {
  await t.test('Sanitizer handles keys containing regex meta-characters without crashes or corruptions', () => {
    const adversarialKeys = [
      'key.with.dots.*[0-9]+',
      'key$with$dollars$$$1$$2',
      'key(with|parentheses)?',
      'key\\with\\backslashes\\d+',
      'key+with+plus+and+asterisks***',
      'key^with^caret',
      'key{1,3}with{braces}'
    ];

    for (const key of adversarialKeys) {
      const rawLog = `Connection to https://example.com?key=${key} with Bearer ${key} failed with message: key=${key}`;
      assert.doesNotThrow(() => {
        const sanitized = sanitizeLogMessage(rawLog, key);
        assert(!sanitized.includes(key), `Key with regex special characters "${key}" must be stripped from log`);
        assert(sanitized.includes('***'), `Log must contain mask string '***'`);
      }, `Sanitizer crashed on adversarial key "${key}"`);
    }
  });
});

test('⚔️ Adversarial Suite: LLM Error Matrix and Fallback Resilience', async (t) => {
  const testTitle = 'Attention Is All You Need';
  const testAbstract = 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.';
  const apiConfig = { provider: 'Gemini', apiKey: 'AIzaSyAdversarialTestKey', customTopic: 'Transformer Models' };

  const chaosResponses = [
    { shouldThrow: true, errorMessage: 'ECONNRESET: Socket closed abruptly' },
    { shouldThrow: true, errorMessage: 'ETIMEDOUT: Connection timed out after 10000ms' },
    { status: 401, statusText: 'Unauthorized: Invalid API Key' },
    { status: 403, statusText: 'Forbidden: Project Quota Exceeded' },
    { status: 429, statusText: 'Too Many Requests: Rate Limit Reached' },
    { status: 500, statusText: 'Internal Server Error' },
    { status: 503, statusText: 'Service Unavailable' },
    { status: 200, text: 'This is not valid JSON at all.' },
    { status: 200, text: '{"catchyTitle": "Incomplete JSON' },
    { status: 200, text: '{"wrong_key": 123}' },
    { status: 200, text: '' }
  ];

  for (const chaos of chaosResponses) {
    await t.test(`Survives LLM chaos condition: ${chaos.errorMessage || chaos.statusText || chaos.text || 'empty'}`, async () => {
      const result = await synthesizeWithLlmMock(testTitle, testAbstract, apiConfig, chaos);
      assert.ok(result, 'Synthesis must return a result object');
      assert.ok(result.catchyTitle, 'Must return a non-empty catchyTitle');
      assert.ok(result.summary, 'Must return a non-empty summary');
      assert.strictEqual(result.catchyTitle, testTitle, 'Fallback catchyTitle should match original title on error');
      assert.strictEqual(result.summary, testAbstract, 'Fallback summary should match original abstract on error');
    });
  }
});

test('⚔️ Adversarial Suite: Complex Multi-Device State Synchronization Matrix', async (t) => {
  await t.test('Multi-device state sync resolves complex interleaved offline edits without data loss', () => {
    // Device A (Mobile - Offline for 3 days)
    const deviceALocal = {
      followedTopics: ['ml', 'nlp', 'robotics'],
      savedPapers: [
        { id: 'paper-a1', originalTitle: 'Offline Paper A1', catchyTitle: 'Paper A1', summary: 'Summary A1', authors: ['A'], source: 'arxiv', year: 2024, venue: 'arXiv', url: '#', pdfUrl: null, topics: ['ml'], likes: 0 },
        { id: 'paper-shared', originalTitle: 'Shared Paper A', catchyTitle: 'Shared A Title', summary: 'Summary Shared A', authors: ['Shared'], source: 'arxiv', year: 2024, venue: 'arXiv', url: '#', pdfUrl: null, topics: ['nlp'], likes: 0 }
      ],
      likedPapers: ['paper-a1', 'paper-shared'],
      streak: { current: 3, longest: 3, lastActiveDay: '2026-08-16', freezes: 1, freezesEarned: 1, totalDays: 5 },
      onboardingComplete: true,
      userApiConfig: { provider: 'Grok', apiKey: 'xai-device-a-key', customTopic: 'Robotics Sim2Real' }
    };

    // Device B (Tablet - Online, previously synced to cloud)
    const deviceBCloud = {
      followedTopics: ['cv', 'nlp', 'cybersecurity'],
      savedPapers: [
        { id: 'paper-b1', originalTitle: 'Cloud Paper B1', catchyTitle: 'Paper B1', summary: 'Summary B1', authors: ['B'], source: 'openalex', year: 2024, venue: 'IEEE', url: '#', pdfUrl: null, topics: ['cv'], likes: 0 },
        { id: 'paper-shared', originalTitle: 'Shared Paper B', catchyTitle: 'Shared B Title', summary: 'Summary Shared B', authors: ['Shared'], source: 'arxiv', year: 2024, venue: 'arXiv', url: '#', pdfUrl: null, topics: ['nlp'], likes: 0 }
      ],
      likedPapers: ['paper-b1', 'paper-shared', 'paper-b2'],
      streak: { current: 2, longest: 10, lastActiveDay: '2026-08-15', freezes: 2, freezesEarned: 2, totalDays: 14 },
      onboardingComplete: true,
      userApiConfig: { provider: 'Grok', apiKey: 'xai-cloud-key', customTopic: 'Vision Transformers' }
    };

    const merged = mergeCloudAndLocalState(deviceALocal, deviceBCloud);

    // Topics: union of both devices = ['cv', 'nlp', 'cybersecurity', 'ml', 'robotics']
    const expectedTopics = ['cv', 'nlp', 'cybersecurity', 'ml', 'robotics'];
    assert.strictEqual(merged.followedTopics.length, 5);
    for (const topic of expectedTopics) {
      assert(merged.followedTopics.includes(topic), `Merged topics must include ${topic}`);
    }

    // Saved papers: union of paper-a1, paper-b1, paper-shared (3 total)
    assert.strictEqual(merged.savedPapers.length, 3);
    const paperIds = merged.savedPapers.map(p => p.id);
    assert(paperIds.includes('paper-a1'));
    assert(paperIds.includes('paper-b1'));
    assert(paperIds.includes('paper-shared'));

    // Liked papers: union of ['paper-a1', 'paper-shared', 'paper-b1', 'paper-b2'] (4 total)
    assert.strictEqual(merged.likedPapers.length, 4);

    // Streak: current=3 (from device A 2026-08-16), longest=10 (from device B), freezes=2 (max), totalDays=14 (max)
    assert.strictEqual(merged.streak.current, 3);
    assert.strictEqual(merged.streak.longest, 10);
    assert.strictEqual(merged.streak.lastActiveDay, '2026-08-16');
    assert.strictEqual(merged.streak.freezes, 2);
    assert.strictEqual(merged.streak.totalDays, 14);

    // API Config: Local device A key takes priority when populated
    assert.strictEqual(merged.userApiConfig.apiKey, 'xai-device-a-key');
    assert.strictEqual(merged.userApiConfig.customTopic, 'Robotics Sim2Real');
  });
});

test('⚔️ Adversarial Suite: SQLite Database Massive Stress & Interleaved Read/Write', async (t) => {
  const testDbDir = path.join(__dirname, 'scratch_db');
  if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
  const testDbPath = path.join(testDbDir, `massive_stress_${Date.now()}.sqlite`);
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

  function insertPaper(topic, paper) {
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

  function readPapers(topic) {
    return new Promise((resolve, reject) => {
      testDb.all(`SELECT * FROM papers WHERE topic = ? ORDER BY fetchedAt DESC LIMIT 10`, [topic], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  await t.test('Survives 100 interleaved concurrent reads and writes with Unicode and exotic payloads', async () => {
    const topics = ['ml', 'dl', 'nlp', 'cv', 'ai-health', 'llm', 'robotics', 'cybersecurity', 'data-science', 'bio'];
    const tasks = [];

    // Schedule 100 mixed read/write tasks
    for (let i = 0; i < 100; i++) {
      const topic = topics[i % topics.length];
      if (i % 3 === 0) {
        // Read task
        tasks.push(readPapers(topic));
      } else {
        // Write task with exotic Unicode & extreme lengths
        const paper = {
          id: `stress-paper-${i % 20}`,
          originalTitle: `Quantum-Resistant 🧬 Cryptography with 日本語 & العربية [${i}]`,
          catchyTitle: `Quantum Crypto Breakthrough ${i}`,
          summary: 'A'.repeat(2500) + ` (Summary length test ${i})`,
          authors: Array.from({ length: 25 }, (_, idx) => `Author ${idx} von Neumann`),
          source: 'arxiv',
          year: 2024,
          venue: 'IEEE Security & Privacy 2024',
          url: `https://arxiv.org/abs/2405.000${i}`,
          pdfUrl: i % 2 === 0 ? `https://arxiv.org/pdf/2405.000${i}.pdf` : null
        };
        tasks.push(insertPaper(topic, paper));
      }
    }

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, 100, 'All 100 concurrent interleaved operations must succeed without error');

    // Verify DB integrity
    const count = await new Promise((resolve, reject) => {
      testDb.all(`SELECT COUNT(*) as cnt FROM papers`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0].cnt);
      });
    });
    assert(count > 0, 'Database should contain papers');
  });

  // Clean up
  testDb.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch {}
});
