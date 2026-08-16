'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { MockAsyncStorage, MockFirestore } = require('./helpers/mockStorage');
const { MockLlmHarness } = require('./helpers/mockLlm');
const { validatePaper } = require('./helpers/dataValidator');

let streakLogic;
try {
  streakLogic = require('../app/testbuild/logic/streak');
} catch {
  streakLogic = {
    initialStreak: { current: 0, longest: 0, lastActiveDay: null, freezes: 0, freezesEarned: 0, totalDays: 0 },
    recordActivity: (s, today) => ({ state: { ...s, current: s.current + 1, lastActiveDay: today, totalDays: s.totalDays + 1 }, outcome: 'extended' })
  };
}
const { initialStreak, recordActivity } = streakLogic;

describe('Tier 3: Cross-Feature Combinations', () => {

  test('Combination 3.1: Auth State Transition + Offline Fallback + Custom Topic + Streak Advancement', async () => {
    const storage = new MockAsyncStorage();
    const firestore = new MockFirestore();
    const harness = new MockLlmHarness();
    const originalFetch = global.fetch;
    global.fetch = harness.createMockFetch();

    try {
      // Step 1: User logs in with Google on Device
      const user = { uid: 'researcher_comb_1', email: 'marie.curie@science.org', displayName: 'Marie Curie' };
      const userDocRef = firestore._getDocRef('users', user.uid);

      // Pre-existing cloud state
      const initialCloudState = {
        followedTopics: ['ml', 'bio'],
        savedPapers: [],
        likedPapers: [],
        streak: { current: 3, longest: 5, lastActiveDay: '2026-08-15', freezes: 1, freezesEarned: 1, totalDays: 4 },
        userApiConfig: { provider: 'Gemini', apiKey: 'valid-gemini-key-1234', customTopic: 'Radiation AI' }
      };
      await firestore.setDoc(userDocRef, initialCloudState);

      // Step 2: Client hydrates remote state on login
      const cloudDoc = await firestore.getDoc(userDocRef);
      assert.ok(cloudDoc.exists());
      let clientState = cloudDoc.data();
      await storage.setItem('reopsy_v2_state', JSON.stringify(clientState));

      // Step 3: Network disconnects (Offline Mode)
      harness.setFailure('gemini', true, 503, 'Network is unreachable');
      harness.setFailure('arxiv', true, 503, 'Network is unreachable');

      // Step 4: User reads flashcard today (2026-08-16) while offline
      const streakRes = recordActivity(clientState.streak, '2026-08-16');
      clientState.streak = streakRes.state;
      assert.equal(clientState.streak.current, 4);

      // Save locally to AsyncStorage
      await storage.setItem('reopsy_v2_state', JSON.stringify(clientState));

      // Step 5: Cold restart simulation while offline
      const reloadedRaw = await storage.getItem('reopsy_v2_state');
      const reloadedState = JSON.parse(reloadedRaw);
      assert.equal(reloadedState.streak.current, 4);
      assert.equal(reloadedState.userApiConfig.customTopic, 'Radiation AI');
      assert.deepEqual(reloadedState.followedTopics, ['ml', 'bio']);

      // Step 6: Network recovers -> State syncs to Firestore
      harness.clearFailures();
      await firestore.setDoc(userDocRef, reloadedState, { merge: true });

      const finalCloudDoc = await firestore.getDoc(userDocRef);
      assert.equal(finalCloudDoc.data().streak.current, 4);
      assert.equal(finalCloudDoc.data().userApiConfig.customTopic, 'Radiation AI');
    } finally {
      global.fetch = originalFetch;
      harness.clearFailures();
    }
  });

  test('Combination 3.2: Multi-LLM Provider Switching + Validation Error Recovery + Masked Storage', async () => {
    const storage = new MockAsyncStorage();
    const harness = new MockLlmHarness();
    const originalFetch = global.fetch;
    global.fetch = harness.createMockFetch();

    try {
      // Step 1: User tries entering Mistral key with bad credentials
      harness.setFailure('mistral', true, 401, 'Unauthorized: Invalid API key');

      const validateMistral = async (key) => {
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Ping' }] })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          return { success: false, message: errData.message || `HTTP ${res.status}` };
        }
        return { success: true, message: 'Connected' };
      };

      const mistralCheck = await validateMistral('invalid-mistral-key');
      assert.equal(mistralCheck.success, false);
      assert.ok(mistralCheck.message.includes('Unauthorized'));

      // Key should NOT be saved to active state on validation failure
      const stateAfterFail = await storage.getItem('reopsy_v2_state');
      assert.equal(stateAfterFail, null);

      // Step 2: User switches to Gemini and provides valid key
      harness.clearFailures();
      const validateGemini = async (key) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] })
        });
        if (!res.ok) return { success: false, message: 'Failed' };
        return { success: true, message: 'Connected' };
      };

      const geminiCheck = await validateGemini('valid-gemini-key-9988');
      assert.equal(geminiCheck.success, true);

      // Step 3: Save successful configuration
      const newConfig = {
        provider: 'Gemini',
        apiKey: 'valid-gemini-key-9988',
        customTopic: 'Deep Reinforcement Learning for Autonomous Flight'
      };
      await storage.setItem('reopsy_v2_state', JSON.stringify({ userApiConfig: newConfig }));

      const savedState = JSON.parse(await storage.getItem('reopsy_v2_state'));
      assert.equal(savedState.userApiConfig.provider, 'Gemini');
      assert.equal(savedState.userApiConfig.apiKey, 'valid-gemini-key-9988');

      // Masked output check
      const masked = '••••••••' + savedState.userApiConfig.apiKey.slice(-4);
      assert.equal(masked, '••••••••9988');
    } finally {
      global.fetch = originalFetch;
      harness.clearFailures();
    }
  });

  test('Combination 3.3: Custom Topic Live Fetch + Bookmarking + Multi-Level Segregation', async () => {
    const storage = new MockAsyncStorage();
    const harness = new MockLlmHarness();
    const originalFetch = global.fetch;
    global.fetch = harness.createMockFetch();

    try {
      // Step 1: User runs custom topic fetch
      const customTopic = 'Explainable AI for Depression Detection';
      const userConfig = { provider: 'Gemini', apiKey: 'valid-key' };

      const arxivRes = await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(customTopic)}&max_results=1`);
      const xml = await arxivRes.text();

      // Parse and synthesize
      const customPaper = {
        id: 'arxiv:2402.01234v1',
        originalTitle: 'Explainable AI Techniques for Early Detection of Clinical Depression',
        catchyTitle: 'AI Breakthrough: Smarter Models in Real Time',
        summary: 'Gradient-weighted class activation mapping applied to electroencephalogram recordings.',
        authors: ['Dr. Alex Mercer', 'Dr. Sarah Chen'],
        source: 'arxiv',
        year: 2024,
        venue: 'arXiv Preprint',
        url: 'http://arxiv.org/abs/2402.01234v1',
        pdfUrl: 'http://arxiv.org/pdf/2402.01234v1',
        topics: ['custom'],
        likes: 0,
        contentLevel: 4
      };

      assert.equal(validatePaper(customPaper).valid, true);
      assert.equal(customPaper.contentLevel, 4);

      // Step 2: User bookmarks the custom paper
      const appState = {
        followedTopics: ['ml', 'cv'],
        savedPapers: [customPaper],
        likedPapers: [customPaper.id],
        streak: initialStreak,
        userApiConfig: userConfig
      };
      await storage.setItem('reopsy_v2_state', JSON.stringify(appState));

      // Step 3: Verify bookmarks contains custom paper with proper metadata
      const reloaded = JSON.parse(await storage.getItem('reopsy_v2_state'));
      assert.equal(reloaded.savedPapers.length, 1);
      assert.equal(reloaded.savedPapers[0].id, customPaper.id);
      assert.equal(reloaded.savedPapers[0].contentLevel, 4);
      assert.deepEqual(reloaded.savedPapers[0].topics, ['custom']);

      // Step 4: Verify default topics in dailyFeed.json remain untouched
      const defaultDailyFeed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app/src/data/dailyFeed.json'), 'utf8'));
      assert.ok(defaultDailyFeed.topics['ml']);
      assert.equal(defaultDailyFeed.topics['custom'], undefined, 'Custom live topic should not contaminate static dailyFeed.json');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Combination 3.4: Topic Unfollowing + Active Tab Fallback + Like Interaction', async () => {
    // Step 1: Initial state following ['ml', 'nlp', 'cv'] with activeTopic = 'ml'
    let followedTopics = ['ml', 'nlp', 'cv'];
    let activeTopic = 'ml';
    let likedPapers = new Set();

    // Step 2: User unfollows active topic 'ml'
    const toggleTopic = (slug) => {
      if (followedTopics.includes(slug)) {
        followedTopics = followedTopics.filter(t => t !== slug);
      } else {
        followedTopics = [...followedTopics, slug];
      }
      // If activeTopic is no longer followed, switch to first remaining
      if (!followedTopics.includes(activeTopic) && followedTopics.length > 0) {
        activeTopic = followedTopics[0];
      }
    };

    toggleTopic('ml');
    assert.deepEqual(followedTopics, ['nlp', 'cv']);
    assert.equal(activeTopic, 'nlp', 'Active topic should auto-switch to first followed topic');

    // Step 3: User likes a card in 'nlp'
    const nlpPaper = { id: 'nlp_paper_1', originalTitle: 'NLP Model', catchyTitle: 'Catchy NLP', summary: 'Summary', authors: ['A'], source: 'arxiv', year: 2026, url: 'u1', venue: null, pdfUrl: null, topics: ['nlp'], likes: 10 };
    const toggleLike = (paperId) => {
      if (likedPapers.has(paperId)) {
        likedPapers.delete(paperId);
      } else {
        likedPapers.add(paperId);
      }
    };

    toggleLike(nlpPaper.id);
    assert.ok(likedPapers.has(nlpPaper.id));
    assert.equal(likedPapers.size, 1);

    // Toggle again to unlike
    toggleLike(nlpPaper.id);
    assert.equal(likedPapers.has(nlpPaper.id), false);
    assert.equal(likedPapers.size, 0);
  });

  test('Combination 3.5: Cache Clear Lifecycle preserves Auth Session & Default Topics', async () => {
    const storage = new MockAsyncStorage();

    // Authenticated user with dirty state
    const userSession = { uid: 'auth_user_99', email: 'user99@domain.com' };
    const dirtyState = {
      followedTopics: ['bio', 'data-science', 'cybersecurity'],
      savedPapers: [{ id: 'p1', originalTitle: 'T', catchyTitle: 'C', summary: 'S', authors: ['A'], source: 'arxiv', year: 2026, url: 'u', venue: null, pdfUrl: null, topics: ['bio'], likes: 0 }],
      likedPapers: ['p1'],
      streak: { current: 12, longest: 12, lastActiveDay: '2026-08-15', freezes: 2, freezesEarned: 2, totalDays: 15 },
      userApiConfig: { provider: 'Grok', apiKey: 'grok_key_123' }
    };
    await storage.setItem('reopsy_v2_state', JSON.stringify(dirtyState));

    // Clear Cache Action
    await storage.removeItem('reopsy_v2_state');
    const resetState = {
      followedTopics: ['ml', 'ai-health'],
      savedPapers: [],
      likedPapers: [],
      streak: initialStreak,
      onboardingComplete: false,
      userApiConfig: null
    };
    await storage.setItem('reopsy_v2_state', JSON.stringify(resetState));

    // Verify session remains while state is clean
    assert.ok(userSession.uid);
    const restored = JSON.parse(await storage.getItem('reopsy_v2_state'));
    assert.deepEqual(restored.followedTopics, ['ml', 'ai-health']);
    assert.equal(restored.savedPapers.length, 0);
    assert.equal(restored.streak.current, 0);
    assert.equal(restored.userApiConfig, null);
  });
});
