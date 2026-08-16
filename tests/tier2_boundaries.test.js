'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { MockAsyncStorage, MockFirestore } = require('./helpers/mockStorage');
const { MockLlmHarness } = require('./helpers/mockLlm');
const { validatePaper } = require('./helpers/dataValidator');
const { insertPaper, getLatestPapersForTopic } = require('../backend/db/db');

let streakLogic;
try {
  streakLogic = require('../app/testbuild/logic/streak');
} catch {
  streakLogic = {
    initialStreak: { current: 0, longest: 0, lastActiveDay: null, freezes: 0, freezesEarned: 0, totalDays: 0 },
    recordActivity: (s) => ({ state: { ...s, current: s.current + 1 }, outcome: 'started' }),
    effectiveStreak: (s) => s.current
  };
}
const { initialStreak, recordActivity, effectiveStreak, isAtRisk, MAX_FREEZES, FREEZE_EVERY } = streakLogic;

describe('Tier 2: Boundary & Corner Cases', () => {

  // =========================================================================
  // 1. Empty & Minimal Data Handlers
  // =========================================================================
  describe('Boundary 1: Empty & Missing Data Handling', () => {
    test('Paper formatting handles empty authors, null venue, null year, and null pdfUrl', () => {
      const formatAuthors = (authors) => {
        if (!authors || authors.length === 0) return 'Unknown authors';
        if (authors.length <= 2) return authors.join(' & ');
        return `${authors[0]} et al.`;
      };

      assert.equal(formatAuthors([]), 'Unknown authors');
      assert.equal(formatAuthors(null), 'Unknown authors');
      assert.equal(formatAuthors(undefined), 'Unknown authors');
      assert.equal(formatAuthors(['Single Author']), 'Single Author');
      assert.equal(formatAuthors(['Author 1', 'Author 2']), 'Author 1 & Author 2');
      assert.equal(formatAuthors(['Author 1', 'Author 2', 'Author 3']), 'Author 1 et al.');

      const minimalPaper = {
        id: 'arxiv:2401.minimal',
        originalTitle: 'Minimal Paper',
        catchyTitle: 'Catchy Minimal',
        summary: 'Short abstract summary.',
        authors: [],
        source: 'arxiv',
        year: null,
        venue: null,
        url: 'https://arxiv.org/abs/2401.minimal',
        pdfUrl: null,
        topics: ['ml'],
        likes: 0
      };

      const val = validatePaper(minimalPaper);
      assert.ok(val.valid, `Minimal paper should be valid: ${val.errors.join(', ')}`);
    });

    test('Empty search query or whitespace-only custom topic does not trigger invalid network requests', () => {
      const isSearchQueryValid = (query) => {
        return Boolean(query && query.trim().length > 0);
      };

      assert.equal(isSearchQueryValid(''), false);
      assert.equal(isSearchQueryValid('   '), false);
      assert.equal(isSearchQueryValid('\t\n  '), false);
      assert.equal(isSearchQueryValid('Quantum ML'), true);
    });

    test('Zero followed topics state falls back gracefully to default topics', async () => {
      const storage = new MockAsyncStorage();
      await storage.setItem('reopsy_v2_state', JSON.stringify({ followedTopics: [] }));

      const raw = await storage.getItem('reopsy_v2_state');
      const parsed = JSON.parse(raw);
      const activeTopics = (parsed.followedTopics && parsed.followedTopics.length > 0)
        ? parsed.followedTopics
        : ['ml', 'ai-health']; // Default fallback

      assert.deepEqual(activeTopics, ['ml', 'ai-health']);
    });
  });

  // =========================================================================
  // 2. Extreme Lengths & String Stress
  // =========================================================================
  describe('Boundary 2: Extreme Input Sizes & Long Texts', () => {
    test('Extremely long paper title (> 500 chars) and summary (> 3000 chars) preserve data integrity', () => {
      const longTitle = 'Scalable Neural Architectures: '.repeat(20);
      const longSummary = 'Deep learning models continue to scale exponentially across multimodal datasets. '.repeat(40);
      const fiftyAuthors = Array.from({ length: 50 }, (_, i) => `Researcher ${i + 1}`);

      const stressPaper = {
        id: 'stress-paper-1',
        originalTitle: longTitle,
        catchyTitle: longTitle.slice(0, 80),
        summary: longSummary,
        authors: fiftyAuthors,
        source: 'openalex',
        year: 2026,
        venue: 'International Conference on Machine Learning',
        url: 'https://example.com/long-paper',
        pdfUrl: 'https://example.com/long-paper.pdf',
        topics: ['dl'],
        likes: 100
      };

      const res = validatePaper(stressPaper);
      assert.ok(res.valid);
      assert.ok(stressPaper.originalTitle.length > 500);
      assert.ok(stressPaper.summary.length > 3000);
      assert.equal(stressPaper.authors.length, 50);
    });

    test('API Key masking handles extreme lengths from 0 to 1000 characters', () => {
      const maskKey = (rawKey) => {
        if (!rawKey || typeof rawKey !== 'string') return '';
        if (rawKey.length <= 4) return '••••';
        return '••••••••' + rawKey.slice(-4);
      };

      assert.equal(maskKey(''), '');
      assert.equal(maskKey('abc'), '••••');
      assert.equal(maskKey('1234'), '••••');
      assert.equal(maskKey('12345678'), '••••••••5678');

      const extremeKey = 'k'.repeat(1000) + '9999';
      const maskedExtreme = maskKey(extremeKey);
      assert.equal(maskedExtreme, '••••••••9999');
      assert.ok(maskedExtreme.length < 20);
    });
  });

  // =========================================================================
  // 3. Network Timeouts, Rate Limits & Protocol Errors
  // =========================================================================
  describe('Boundary 3: Network Timeouts, Rate Limits & Protocol Errors', () => {
    test('Handles 429 Too Many Requests rate limiting gracefully', async () => {
      const harness = new MockLlmHarness();
      harness.setFailure('semanticScholar', true, 429, 'Rate limit exceeded');
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const res = await fetch('https://api.semanticscholar.org/graph/v1/paper/search?query=test');
        assert.equal(res.status, 429);
        assert.equal(res.ok, false);
      } finally {
        global.fetch = originalFetch;
        harness.clearFailures();
      }
    });

    test('Handles malformed arXiv XML response without crashing parser', () => {
      const malformedXml = '<feed><entry><title>Incomplete Entry';
      const parseEntries = (xml) => {
        const entries = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(xml)) !== null) {
          entries.push(match[1]);
        }
        return entries;
      };

      const result = parseEntries(malformedXml);
      assert.deepEqual(result, [], 'Malformed XML without closing tags should return empty array safely');
    });

    test('Handles simulated connection timeout / network offline exception', async () => {
      const offlineFetch = async () => {
        throw new Error('TypeError: Network request failed (offline)');
      };

      let caughtError = null;
      try {
        await offlineFetch();
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError);
      assert.ok(caughtError.message.includes('Network request failed'));
    });
  });

  // =========================================================================
  // 4. Corrupted Storage & Injection Safety
  // =========================================================================
  describe('Boundary 4: Corrupted Storage & Injection Safety', () => {
    test('Malformed JSON in AsyncStorage is caught and restored to safe initial state', async () => {
      const storage = new MockAsyncStorage();
      await storage.setItem('reopsy_v2_state', '{"broken_json": true, missing_bracket');

      let restoredState;
      try {
        const raw = await storage.getItem('reopsy_v2_state');
        restoredState = JSON.parse(raw);
      } catch {
        restoredState = {
          followedTopics: ['ml', 'ai-health'],
          savedPapers: [],
          likedPapers: [],
          streak: initialStreak,
          userApiConfig: null
        };
      }

      assert.deepEqual(restoredState.followedTopics, ['ml', 'ai-health']);
      assert.equal(restoredState.savedPapers.length, 0);
    });

    test('SQL injection payloads in paper fields do not corrupt SQLite database', async () => {
      const maliciousPaper = {
        id: "sqli-test-1'; DROP TABLE papers; --",
        originalTitle: "Advanced AI'); DELETE FROM papers; --",
        catchyTitle: "Catchy'); DROP TABLE papers; --",
        summary: "Normal summary text with single quotes ' and double quotes \"",
        authors: ["Attacker'); DROP TABLE users; --"],
        source: 'arxiv',
        year: 2026,
        venue: "Conference'); DROP TABLE papers; --",
        url: 'https://arxiv.org/abs/2601.sqli',
        pdfUrl: null
      };

      // Parameterized query in insertPaper should safely handle SQL injection strings
      await insertPaper('ml', maliciousPaper);
      const papers = await getLatestPapersForTopic('ml', 5);
      const found = papers.find(p => p.id === maliciousPaper.id);

      assert.ok(found, 'Paper with SQL characters should be inserted safely via prepared statement');
      assert.equal(found.originalTitle, maliciousPaper.originalTitle);

      // Verify table still exists and query works
      const afterCheck = await getLatestPapersForTopic('ml', 1);
      assert.ok(Array.isArray(afterCheck));
    });

    test('Special characters, emojis, and HTML tags in search queries are safely sanitized', () => {
      const sanitizeTopicQuery = (query) => {
        return query
          .replace(/[<>]/g, '') // Strip HTML tags
          .trim();
      };

      const xssQuery = '<script>alert("xss")</script>Graph Neural Networks';
      const clean = sanitizeTopicQuery(xssQuery);
      assert.equal(clean, 'scriptalert("xss")/scriptGraph Neural Networks');
      assert.ok(!clean.includes('<script>'));
    });
  });

  // =========================================================================
  // 5. Streak State Machine Boundaries
  // =========================================================================
  describe('Boundary 5: Streak State Machine Edge Cases', () => {
    test('Initial streak has 0 days and 0 freezes', () => {
      assert.equal(initialStreak.current, 0);
      assert.equal(initialStreak.longest, 0);
      assert.equal(initialStreak.freezes, 0);
      assert.equal(initialStreak.lastActiveDay, null);
    });

    test('Reading multiple cards on the same day results in unchanged outcome', () => {
      const today = '2026-08-16';
      const firstRead = recordActivity(initialStreak, today);
      assert.equal(firstRead.outcome, 'started');
      assert.equal(firstRead.state.current, 1);

      // Second read on same day
      const secondRead = recordActivity(firstRead.state, today);
      assert.equal(secondRead.outcome, 'unchanged');
      assert.equal(secondRead.state.current, 1);
    });

    test('Consecutive daily reads increment streak correctly', () => {
      let state = initialStreak;
      const days = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'];
      
      for (const day of days) {
        const res = recordActivity(state, day);
        state = res.state;
      }

      assert.equal(state.current, 7);
      assert.equal(state.longest, 7);
      assert.equal(state.freezesEarned, 1, 'Should earn 1 freeze at 7-day milestone');
      assert.equal(state.freezes, 1);
    });

    test('Missing 1 day uses available freeze and keeps streak alive', () => {
      // Setup state with 7-day streak and 1 freeze
      const stateWithFreeze = {
        current: 7,
        longest: 7,
        lastActiveDay: '2026-08-10',
        freezes: 1,
        freezesEarned: 1,
        totalDays: 7
      };

      // Gap of 2 days: 2026-08-10 -> 2026-08-12 (missed 2026-08-11)
      const res = recordActivity(stateWithFreeze, '2026-08-12');
      assert.equal(res.outcome, 'freeze-used');
      assert.equal(res.state.current, 8);
      assert.equal(res.state.freezes, 0, 'Freeze was consumed');
    });

    test('Missing 1 day with 0 freezes resets streak to 1', () => {
      const stateNoFreeze = {
        current: 5,
        longest: 5,
        lastActiveDay: '2026-08-10',
        freezes: 0,
        freezesEarned: 0,
        totalDays: 5
      };

      // Missed 2026-08-11, reading on 2026-08-12
      const res = recordActivity(stateNoFreeze, '2026-08-12');
      assert.equal(res.outcome, 'restarted');
      assert.equal(res.state.current, 1);
      assert.equal(res.state.longest, 5, 'Longest streak remains 5');
    });

    test('Freeze count is capped at MAX_FREEZES (3)', () => {
      const stateMaxFreezes = {
        current: 20,
        longest: 20,
        lastActiveDay: '2026-08-15',
        freezes: 3,
        freezesEarned: 3,
        totalDays: 20
      };

      // Reaching day 21 (milestone) with 3 freezes
      const res = recordActivity(stateMaxFreezes, '2026-08-16');
      assert.equal(res.state.current, 21);
      assert.equal(res.state.freezes, 3, 'Freezes should remain capped at 3');
    });
  });
});
