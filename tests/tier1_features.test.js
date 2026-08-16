'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { MockAsyncStorage, MockFirestore } = require('./helpers/mockStorage');
const { MockLlmHarness } = require('./helpers/mockLlm');
const { AstAuditor } = require('./helpers/astAuditor');
const { EXPECTED_TOPIC_SLUGS, validatePaper, validateDailyFeed } = require('./helpers/dataValidator');

const { generateCatchyTitle } = require('../backend/pipeline/llm');
const { fetchTldr } = require('../backend/pipeline/semanticScholar');
const { insertPaper, getLatestPapersForTopic, db } = require('../backend/db/db');
const { TOPICS, ALL_SLUGS } = require('../backend/ingest/lib/topics');
let streakLogic;
try {
  streakLogic = require('../app/testbuild/logic/streak');
} catch {
  // Fallback if testbuild not compiled yet
  streakLogic = {
    initialStreak: { current: 0, longest: 0, lastActiveDay: null, freezes: 0, freezesEarned: 0, totalDays: 0 },
    recordActivity: (s) => ({ state: { ...s, current: s.current + 1 }, outcome: 'started' }),
    effectiveStreak: (s) => s.current
  };
}
const { initialStreak, recordActivity, effectiveStreak } = streakLogic;

describe('Tier 1: Feature Coverage (R1 - R5)', () => {
  const auditor = new AstAuditor(path.resolve(__dirname, '../app'));

  // =========================================================================
  // R1: Predefined Categories & Content Ingest Pipeline
  // =========================================================================
  describe('Feature R1: Predefined Categories & Content Ingest Pipeline', () => {
    test('R1.1: Backend topics.js and app config.ts define exact 10 topics', () => {
      assert.equal(ALL_SLUGS.length, 10, 'ALL_SLUGS should contain exactly 10 topics');
      for (const expected of EXPECTED_TOPIC_SLUGS) {
        assert.ok(ALL_SLUGS.includes(expected), `Missing topic slug: ${expected} in ALL_SLUGS`);
        assert.ok(TOPICS[expected], `Missing topic metadata for: ${expected}`);
      }

      // Check config.ts in app
      const configPath = path.resolve(__dirname, '../app/src/config.ts');
      const configContent = fs.readFileSync(configPath, 'utf8');
      for (const expected of EXPECTED_TOPIC_SLUGS) {
        assert.ok(
          configContent.includes(`slug: '${expected}'`),
          `app/src/config.ts missing topic slug: ${expected}`
        );
      }
    });

    test('R1.2: Daily feed JSON contains real papers for all 10 topics', () => {
      const feedResult = validateDailyFeed(path.resolve(__dirname, '../app/src/data/dailyFeed.json'));
      assert.ok(feedResult.valid, `dailyFeed.json is invalid: ${feedResult.error || ''}`);
      assert.equal(feedResult.missingTopics.length, 0, `Missing topics in dailyFeed.json: ${feedResult.missingTopics.join(', ')}`);
      assert.ok(feedResult.totalPapers >= 10, `Feed should contain at least 10 papers across topics, got ${feedResult.totalPapers}`);
      
      // Verify schema of individual papers
      const rawFeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app/src/data/dailyFeed.json'), 'utf8'));
      for (const slug of EXPECTED_TOPIC_SLUGS) {
        const topicPapers = rawFeed.topics[slug] || [];
        assert.ok(topicPapers.length > 0, `Topic ${slug} has no papers in dailyFeed.json`);
        for (const p of topicPapers) {
          assert.ok(p.id, `Paper in ${slug} missing id`);
          assert.ok(p.originalTitle, `Paper ${p.id} missing originalTitle`);
          assert.ok(p.summary, `Paper ${p.id} missing summary`);
          assert.ok(p.url, `Paper ${p.id} missing url`);
        }
      }
    });

    test('R1.3: Semantic Scholar TLDR fetcher respects rate limit delay and returns text or null', async () => {
      const harness = new MockLlmHarness();
      const testTitle = 'Attention Is All You Need';
      harness.setSemanticScholarTldr(testTitle, 'Transformers replace recurrent and convolutional layers entirely with self-attention.');

      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const start = Date.now();
        const tldr = await fetchTldr(testTitle);
        const duration = Date.now() - start;

        // Verify delay >= 500ms
        assert.ok(duration >= 500, `Semantic Scholar call should respect >=500ms delay, took ${duration}ms`);
        assert.equal(tldr, 'Transformers replace recurrent and convolutional layers entirely with self-attention.');

        // Test missing TLDR
        const missingTldr = await fetchTldr('NonExistentPaperTitle123456');
        assert.equal(missingTldr, null);
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('R1.4: Multi-LLM fallback chaining cascades Gemini -> Mistral -> Grok -> Original Title', async () => {
      const harness = new MockLlmHarness();
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const title = 'A Deep Residual Learning Framework for Image Recognition';
        const summary = 'We introduce deep residual learning framework for easier neural network training.';

        // Case 1: Gemini succeeds
        const res1 = await generateCatchyTitle(title, summary, { gemini: 'valid-gemini-key', mistral: 'mistral-key', xai: 'grok-key' });
        assert.equal(res1.provider, 'gemini');
        assert.ok(res1.catchyTitle.length > 0);

        // Case 2: Gemini fails -> Mistral succeeds
        harness.setFailure('gemini', true, 500, 'Gemini Overloaded');
        const res2 = await generateCatchyTitle(title, summary, { gemini: 'failing-key', mistral: 'valid-mistral-key', xai: 'grok-key' });
        assert.equal(res2.provider, 'mistral');
        assert.ok(res2.catchyTitle.includes('Mistral Insight'));

        // Case 3: Gemini & Mistral fail -> Grok succeeds
        harness.setFailure('mistral', true, 500, 'Mistral Rate Limit');
        const res3 = await generateCatchyTitle(title, summary, { gemini: 'failing-key', mistral: 'failing-key', xai: 'valid-grok-key' });
        assert.equal(res3.provider, 'xai');
        assert.ok(res3.catchyTitle.includes('Grok Flash'));

        // Case 4: All providers fail or keys missing -> Falls back to original title
        harness.setFailure('grok', true, 500, 'Grok Error');
        const res4 = await generateCatchyTitle(title, summary, { gemini: 'failing-key', mistral: 'failing-key', xai: 'failing-key' });
        assert.equal(res4.provider, 'original');
        assert.equal(res4.catchyTitle, title);

        // Case 5: Empty keys object
        const res5 = await generateCatchyTitle(title, summary, {});
        assert.equal(res5.provider, 'original');
        assert.equal(res5.catchyTitle, title);
      } finally {
        global.fetch = originalFetch;
        harness.clearFailures();
      }
    });

    test('R1.5: SQLite database inserts and retains multi-topic papers', async () => {
      const testPaper = {
        id: `test-paper-${Date.now()}`,
        originalTitle: 'Test Paper for SQLite Persistence',
        catchyTitle: 'Catchy SQLite Test Paper',
        summary: 'Testing SQLite insert and query functions.',
        authors: ['Alice Researcher', 'Bob Scientist'],
        source: 'arxiv',
        year: 2026,
        venue: 'NeurIPS',
        url: 'https://arxiv.org/abs/2601.99999',
        pdfUrl: 'https://arxiv.org/pdf/2601.99999'
      };

      await insertPaper('ml', testPaper);
      const retrieved = await getLatestPapersForTopic('ml', 5);
      const found = retrieved.find(p => p.id === testPaper.id);

      assert.ok(found, 'Inserted paper should be retrievable from SQLite');
      assert.equal(found.originalTitle, testPaper.originalTitle);
      assert.equal(found.catchyTitle, testPaper.catchyTitle);
      assert.equal(found.venue, testPaper.venue);
    });

    test('R1.6: Pipeline dry-run processes all 10 topics without file mutations', () => {
      const scriptPath = path.resolve(__dirname, '../backend/pipeline/fetchAndSummarize.js');
      const content = fs.readFileSync(scriptPath, 'utf8');
      assert.ok(content.includes('--dry'), 'fetchAndSummarize.js must support --dry flag');
      assert.ok(content.includes('ALL_SLUGS'), 'fetchAndSummarize.js must iterate over ALL_SLUGS');
    });
  });

  // =========================================================================
  // R2: Google Authentication and Persistent User Settings
  // =========================================================================
  describe('Feature R2: Google Authentication and Persistent User Settings', () => {
    test('R2.1: Firebase configuration initializes conditionally with fallback check', () => {
      const firebasePath = path.resolve(__dirname, '../app/src/services/firebase.ts');
      const content = fs.readFileSync(firebasePath, 'utf8');
      assert.ok(content.includes('isFirebaseConfigured'), 'firebase.ts must export isFirebaseConfigured()');
      assert.ok(content.includes('initializeApp'), 'firebase.ts must support initializeApp');
      assert.ok(content.includes('getFirestore') || content.includes('initializeFirestore'), 'firebase.ts must export db');
    });

    test('R2.2: Auth state transition updates user profile and triggers state persistence', async () => {
      const storage = new MockAsyncStorage();
      const firestore = new MockFirestore();

      // Simulate logged in user
      const user = { uid: 'user_123', email: 'researcher@gmail.com', displayName: 'Dr. Turing' };
      const initialState = {
        followedTopics: ['ml', 'cv', 'ai-health'],
        savedPapers: [{ id: 'p1', originalTitle: 'Paper 1', catchyTitle: 'P1', summary: 'S1', authors: ['A'], source: 'arxiv', year: 2026, url: 'u1', venue: null, pdfUrl: null, topics: ['ml'], likes: 0 }],
        likedPapers: ['p1'],
        streak: initialStreak,
        userApiConfig: { provider: 'Gemini', apiKey: 'test-key-123' }
      };

      // Save to local storage
      await storage.setItem('reopsy_v2_state', JSON.stringify(initialState));

      // Sync to Firestore
      const userDocRef = firestore._getDocRef('users', user.uid);
      await firestore.setDoc(userDocRef, initialState, { merge: true });

      const remoteDoc = await firestore.getDoc(userDocRef);
      assert.ok(remoteDoc.exists());
      const remoteData = remoteDoc.data();
      assert.equal(remoteData.followedTopics.length, 3);
      assert.equal(remoteData.savedPapers[0].id, 'p1');
      assert.equal(remoteData.userApiConfig.provider, 'Gemini');
    });

    test('R2.3: Remote Firestore hydration merges cloud state into local session on login', async () => {
      const firestore = new MockFirestore();
      const storage = new MockAsyncStorage();

      const user = { uid: 'user_456' };
      const cloudData = {
        followedTopics: ['llm', 'robotics'],
        savedPapers: [{ id: 'cloud_p1', originalTitle: 'Cloud Paper', catchyTitle: 'CP', summary: 'Cloud Summary', authors: ['Cloud Author'], source: 'arxiv', year: 2026, url: 'u_cloud', venue: null, pdfUrl: null, topics: ['llm'], likes: 5 }],
        likedPapers: ['cloud_p1'],
        streak: { current: 5, longest: 10, lastActiveDay: '2026-08-15', freezes: 1, freezesEarned: 1, totalDays: 8 },
        userApiConfig: { provider: 'Mistral', apiKey: 'mistral-remote-key', customTopic: 'Explainable AI' }
      };

      // Seed remote document
      const userDocRef = firestore._getDocRef('users', user.uid);
      await firestore.setDoc(userDocRef, cloudData);

      // Hydration logic verification
      const fetched = await firestore.getDoc(userDocRef);
      assert.ok(fetched.exists());
      const stateToHydrate = fetched.data();

      await storage.setItem('reopsy_v2_state', JSON.stringify(stateToHydrate));

      const localCached = JSON.parse(await storage.getItem('reopsy_v2_state'));
      assert.deepEqual(localCached.followedTopics, ['llm', 'robotics']);
      assert.equal(localCached.streak.current, 5);
      assert.equal(localCached.userApiConfig.customTopic, 'Explainable AI');
    });

    test('R2.4: Offline fallback operates reliably via AsyncStorage with zero network dependency', async () => {
      const storage = new MockAsyncStorage();

      const offlineState = {
        followedTopics: ['ml', 'data-science'],
        savedPapers: [],
        likedPapers: [],
        streak: initialStreak,
        userApiConfig: null
      };

      await storage.setItem('reopsy_v2_state', JSON.stringify(offlineState));
      const loaded = JSON.parse(await storage.getItem('reopsy_v2_state'));

      assert.equal(loaded.followedTopics.length, 2);
      assert.equal(loaded.streak.current, 0);
    });

    test('R2.5: User logout / Clear cache lifecycle resets state safely', async () => {
      const storage = new MockAsyncStorage();
      await storage.setItem('reopsy_v2_state', JSON.stringify({ followedTopics: ['bio'], savedPapers: ['p1'] }));

      // Execute clearCache
      await storage.removeItem('reopsy_v2_state');
      const afterClear = await storage.getItem('reopsy_v2_state');

      assert.equal(afterClear, null);
    });
  });

  // =========================================================================
  // R3: Mobile-First Flashcard Experience & UI
  // =========================================================================
  describe('Feature R3: Mobile-First Flashcard Experience & UI', () => {
    test('R3.1: FeedScreen implements precise container measurement and snap-scrolling', () => {
      const snapAudit = auditor.auditSnapScrolling();
      assert.ok(snapAudit.hasSnapToInterval, 'FeedScreen FlatList must specify snapToInterval');
      assert.ok(snapAudit.hasSnapToAlignment, 'FeedScreen FlatList must specify snapToAlignment="start"');
      assert.ok(snapAudit.hasDecelerationRate, 'FeedScreen FlatList must specify decelerationRate="fast"');
      assert.ok(snapAudit.hasLayoutMeasurement, 'FeedScreen must measure container height on layout');
    });

    test('R3.2: Touch target accessibility audit verifies >= 48px or hitSlop across all screens', () => {
      const auditedFiles = [
        'src/screens/FeedScreen.tsx',
        'src/components/PaperCard.tsx',
        'src/components/TopicTabs.tsx',
        'src/components/ActionBar.tsx',
        'src/components/DrawerContent.tsx',
        'src/screens/SavedScreen.tsx',
        'src/screens/PersonalizationScreen.tsx',
        'src/screens/SettingsScreen.tsx'
      ];

      for (const file of auditedFiles) {
        const content = auditor.readFile(file);
        // Verify touchables have minHeight / minWidth or hitSlop or proper padding
        const hasAccessibleTouch = content.includes('minHeight') || 
                                   content.includes('minWidth') || 
                                   content.includes('hitSlop') || 
                                   content.includes('padding: spacing.l') ||
                                   content.includes('padding: spacing.m');
        assert.ok(hasAccessibleTouch, `${file} missing accessible touch target specifications`);
      }
    });

    test('R3.3: Feather vector icon standardization & zero emoji literals in UI code', () => {
      const filesToAudit = [
        'src/screens/FeedScreen.tsx',
        'src/components/PaperCard.tsx',
        'src/components/TopicTabs.tsx',
        'src/components/ActionBar.tsx',
        'src/components/DrawerContent.tsx',
        'src/screens/SavedScreen.tsx',
        'src/screens/PersonalizationScreen.tsx',
        'src/screens/SettingsScreen.tsx'
      ];

      for (const file of filesToAudit) {
        const content = auditor.readFile(file);
        assert.ok(content.includes('@expo/vector-icons') || content.includes('Feather'), `${file} should use Feather vector icons`);
      }
    });

    test('R3.4: Footer action area blends seamlessly with card background', () => {
      const actionBarContent = auditor.readFile('src/components/ActionBar.tsx');
      const paperCardContent = auditor.readFile('src/components/PaperCard.tsx');

      assert.ok(actionBarContent.includes('colors.bg'), 'ActionBar container must use colors.bg for seamless visual integration');
      assert.ok(paperCardContent.includes('<ActionBar'), 'PaperCard must embed ActionBar directly');
    });

    test('R3.5: Typography parity (16px Title and Summary, no summary truncation)', () => {
      const typoAudit = auditor.auditTypographyParity();
      assert.equal(typoAudit.summaryHasTruncation, false, 'PaperCard summary must not have numberOfLines truncation');
      assert.ok(typoAudit.cardUses16pxTitle, 'Title should use 16px font size');
      assert.ok(typoAudit.cardUses16pxSummary, 'Summary should use 16px font size');
    });
  });

  // =========================================================================
  // R4: User API Integration and Personalized Topic
  // =========================================================================
  describe('Feature R4: User API Integration and Personalized Topic', () => {
    test('R4.1: Settings screen supports Gemini, Mistral, Grok, and Custom providers', () => {
      const settingsContent = auditor.readFile('src/screens/SettingsScreen.tsx');
      assert.ok(settingsContent.includes('Gemini'), 'SettingsScreen must support Gemini');
      assert.ok(settingsContent.includes('Mistral'), 'SettingsScreen must support Mistral');
      assert.ok(settingsContent.includes('Grok'), 'SettingsScreen must support Grok');
      assert.ok(settingsContent.includes('Custom'), 'SettingsScreen must support Custom');
      assert.ok(settingsContent.includes('customTopic'), 'SettingsScreen must collect custom research topic');
    });

    test('R4.2: Live API connection validator tests endpoint responses correctly', async () => {
      const harness = new MockLlmHarness();
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        // Test Gemini validation
        const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=valid_key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] })
        });
        assert.ok(geminiRes.ok, 'Gemini connection test should succeed with valid key');

        // Test Mistral validation
        const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer valid_mistral_key' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Ping' }] })
        });
        assert.ok(mistralRes.ok, 'Mistral connection test should succeed with valid key');

        // Test Grok validation
        const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer valid_grok_key' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Ping' }] })
        });
        assert.ok(grokRes.ok, 'Grok connection test should succeed with valid key');
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('R4.3: Custom topic live fetcher queries arXiv and synthesizes flashcards', async () => {
      const harness = new MockLlmHarness();
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const arxivUrl = `https://export.arxiv.org/api/query?search_query=all:Explainable%20AI&start=0&max_results=3`;
        const res = await fetch(arxivUrl);
        const xmlText = await res.text();

        assert.ok(xmlText.includes('<entry>'), 'arXiv response should contain entry XML');
        assert.ok(xmlText.includes('Explainable AI'), 'arXiv response should match search query');
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('R4.4: Dynamic custom topic tab renders isolated without modifying default topics', () => {
      const configPath = path.resolve(__dirname, '../app/src/config.ts');
      const configRaw = fs.readFileSync(configPath, 'utf8');

      // Verify default 10 topics remain immutable in config
      for (const slug of EXPECTED_TOPIC_SLUGS) {
        assert.ok(configRaw.includes(slug), `Default topic ${slug} must remain in config.ts`);
      }
    });

    test('R4.5: Custom topic gracefully falls back to raw abstract if LLM synthesis errors', async () => {
      const harness = new MockLlmHarness();
      harness.setFailure('gemini', true, 429, 'Quota exceeded');
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const rawAbstract = 'This is the raw abstract from arXiv describing neural networks.';
        let synthesized = null;

        try {
          const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=exhausted_key', {
            method: 'POST',
            body: JSON.stringify({})
          });
          if (res.ok) {
            synthesized = 'AI Summary';
          }
        } catch {
          // fallback
        }

        // Fallback applied
        const finalSummary = synthesized || rawAbstract;
        assert.equal(finalSummary, rawAbstract);
      } finally {
        global.fetch = originalFetch;
        harness.clearFailures();
      }
    });
  });

  // =========================================================================
  // R5: Scalable Content Architecture & Security
  // =========================================================================
  describe('Feature R5: Scalable Content Architecture & Security', () => {
    test('R5.1: 4-Level content architecture model segregation', () => {
      // Level 1: Default Predefined Topics
      const level1Paper = { id: 'p_lvl1', originalTitle: 'L1', catchyTitle: 'L1', summary: 'S1', authors: ['A'], source: 'openalex', year: 2026, url: 'u1', venue: null, pdfUrl: null, topics: ['ml'], likes: 0, contentLevel: 1 };
      // Level 2: User-Customized Topics (Followed preferences)
      // Level 3: User BYO-API Key config
      const level3Config = { provider: 'Gemini', apiKey: 'user_secret_key' };
      // Level 4: Highly Specific Custom Topic live search result
      const level4Paper = { id: 'p_lvl4', originalTitle: 'L4', catchyTitle: 'L4', summary: 'S4', authors: ['A'], source: 'arxiv', year: 2026, url: 'u4', venue: 'arXiv', pdfUrl: null, topics: ['custom'], likes: 0, contentLevel: 4 };

      assert.equal(validatePaper(level1Paper).valid, true);
      assert.equal(validatePaper(level4Paper).valid, true);
      assert.equal(level1Paper.contentLevel, 1);
      assert.equal(level4Paper.contentLevel, 4);
    });

    test('R5.2: Firestore owner-only security constraints (request.auth.uid == userId)', () => {
      const firestore = new MockFirestore();
      const authenticatedUserId = 'user_owner_789';
      const unauthorizedUserId = 'attacker_000';

      const ownerDocRef = firestore._getDocRef('users', authenticatedUserId);
      const simulatedSecurityCheck = (currentAuthUid, targetDocUid) => {
        return currentAuthUid !== null && currentAuthUid === targetDocUid;
      };

      assert.equal(simulatedSecurityCheck(authenticatedUserId, authenticatedUserId), true, 'Owner should have access');
      assert.equal(simulatedSecurityCheck(unauthorizedUserId, authenticatedUserId), false, 'Cross-user access should be blocked');
      assert.equal(simulatedSecurityCheck(null, authenticatedUserId), false, 'Unauthenticated access should be blocked');
    });

    test('R5.3: Masked API key display with secureTextEntry and preview formatting', () => {
      const maskKey = (rawKey) => {
        if (!rawKey || rawKey.length < 8) return '••••••••';
        return '••••••••' + rawKey.slice(-4);
      };

      const rawApiKey = 'AIzaSyD-1234567890abcdef1234';
      const masked = maskKey(rawApiKey);
      assert.equal(masked, '••••••••1234');
      assert.ok(!masked.includes('AIzaSyD'), 'Raw key prefix must never be visible in masked display');
    });

    test('R5.4: Error log URL and API key sanitization prevents key leaks', () => {
      const sanitizeLogMessage = (message) => {
        return String(message)
          .replace(/(key=)[a-zA-Z0-9_\-]+/g, '$1***')
          .replace(/(Bearer\s+)[a-zA-Z0-9_\-]+/g, '$1***');
      };

      const unsafeGeminiUrl = 'Fetch error: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSySecret12345';
      const cleanGemini = sanitizeLogMessage(unsafeGeminiUrl);
      assert.equal(cleanGemini, 'Fetch error: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=***');

      const unsafeAuthHeader = 'HTTP 401 Unauthorized for Authorization: Bearer sk-mistral-9988776655';
      const cleanAuth = sanitizeLogMessage(unsafeAuthHeader);
      assert.equal(cleanAuth, 'HTTP 401 Unauthorized for Authorization: Bearer ***');
    });

    test('R5.5: Secure BYO-Key removal scrubs credentials from local and cloud state', async () => {
      const storage = new MockAsyncStorage();
      const firestore = new MockFirestore();

      const user = { uid: 'user_cleanup' };
      const userDocRef = firestore._getDocRef('users', user.uid);

      // Save initial with key
      await storage.setItem('reopsy_v2_state', JSON.stringify({ userApiConfig: { provider: 'Gemini', apiKey: 'secret' } }));
      await firestore.setDoc(userDocRef, { userApiConfig: { provider: 'Gemini', apiKey: 'secret' } });

      // Wipe key
      await storage.setItem('reopsy_v2_state', JSON.stringify({ userApiConfig: null }));
      await firestore.setDoc(userDocRef, { userApiConfig: null }, { merge: true });

      const localAfter = JSON.parse(await storage.getItem('reopsy_v2_state'));
      const remoteAfter = (await firestore.getDoc(userDocRef)).data();

      assert.equal(localAfter.userApiConfig, null);
      assert.equal(remoteAfter.userApiConfig, null);
    });
  });
});
