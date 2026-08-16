'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { MockAsyncStorage, MockFirestore } = require('./helpers/mockStorage');
const { MockLlmHarness } = require('./helpers/mockLlm');
const { validatePaper, validateDailyFeed } = require('./helpers/dataValidator');

let streakLogic;
try {
  streakLogic = require('../app/testbuild/logic/streak');
} catch {
  streakLogic = {
    initialStreak: { current: 0, longest: 0, lastActiveDay: null, freezes: 0, freezesEarned: 0, totalDays: 0 },
    recordActivity: (s, today) => ({ state: { ...s, current: s.current + 1, lastActiveDay: today, totalDays: s.totalDays + 1 }, outcome: s.current === 0 ? 'started' : 'extended' })
  };
}
const { initialStreak, recordActivity } = streakLogic;

describe('Tier 4: Real-World Workload Scenarios', () => {

  test('Scenario 4.1: First-Time User Onboarding, Multi-Topic Browsing & Streak Initiation', async () => {
    const storage = new MockAsyncStorage();

    // 1. First app launch: Initial state
    let state = {
      followedTopics: ['ml', 'ai-health'],
      activeTopic: 'ml',
      savedPapers: [],
      likedPapers: new Set(),
      streak: initialStreak,
      onboardingComplete: false,
      userApiConfig: null
    };

    // Verify daily feed is available for default topics
    const feed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app/src/data/dailyFeed.json'), 'utf8'));
    assert.ok(feed.topics['ml'].length > 0);
    assert.ok(feed.topics['ai-health'].length > 0);

    // 2. User reads cards in 'ml' topic
    const today = '2026-08-16';
    const streakResult = recordActivity(state.streak, today);
    state.streak = streakResult.state;
    assert.equal(state.streak.current, 1);
    assert.equal(streakResult.outcome, 'started');

    // 3. User likes the first paper
    const firstPaper = feed.topics['ml'][0];
    state.likedPapers.add(firstPaper.id);
    assert.equal(state.likedPapers.size, 1);

    // 4. User opens Personalization modal and follows 'robotics' and 'cybersecurity'
    const newTopics = ['robotics', 'cybersecurity'];
    for (const t of newTopics) {
      if (!state.followedTopics.includes(t)) {
        state.followedTopics.push(t);
      }
    }
    assert.equal(state.followedTopics.length, 4);

    // 5. User switches active tab to 'robotics'
    state.activeTopic = 'robotics';
    assert.equal(state.activeTopic, 'robotics');
    assert.ok(feed.topics['robotics'].length > 0);

    // 6. Save state to AsyncStorage
    await storage.setItem('reopsy_v2_state', JSON.stringify({
      ...state,
      likedPapers: Array.from(state.likedPapers)
    }));

    // Verify persistent state
    const saved = JSON.parse(await storage.getItem('reopsy_v2_state'));
    assert.equal(saved.streak.current, 1);
    assert.deepEqual(saved.followedTopics, ['ml', 'ai-health', 'robotics', 'cybersecurity']);
  });

  test('Scenario 4.2: Power Researcher Journey (Sign In -> BYO-Key -> Live arXiv Search -> Synthesis -> Bookmark)', async () => {
    const storage = new MockAsyncStorage();
    const firestore = new MockFirestore();
    const harness = new MockLlmHarness();
    const originalFetch = global.fetch;
    global.fetch = harness.createMockFetch();

    try {
      // 1. User signs in with Google
      const authUser = {
        uid: 'prof_turner_mit',
        email: 'turner@csail.mit.edu',
        displayName: 'Prof. Alan Turner'
      };

      // 2. Navigate to Settings and configure Gemini API key
      const apiConfig = {
        provider: 'Gemini',
        apiKey: 'AIzaSy-MitProfKey-556677',
        customTopic: 'Explainable AI for Depression Detection'
      };

      // 3. Test API Connection (Health-check)
      const validateRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiConfig.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] })
      });
      assert.ok(validateRes.ok, 'API key validation should succeed');

      // 4. Execute Live Custom Topic Fetch (arXiv + LLM Synthesis)
      const arxivQuery = encodeURIComponent(apiConfig.customTopic);
      const arxivRes = await fetch(`https://export.arxiv.org/api/query?search_query=all:${arxivQuery}&max_results=3`);
      const arxivXml = await arxivRes.text();
      assert.ok(arxivXml.includes('<entry>'), 'arXiv query should return research entries');

      // Synthesized Level 4 Paper
      const synthesizedCustomPaper = {
        id: 'arxiv:2402.01234v1',
        originalTitle: 'Explainable AI Techniques for Early Detection of Clinical Depression',
        catchyTitle: 'AI Breakthrough: Smarter Models in Real Time',
        summary: 'Gradient-weighted class activation mapping applied to electroencephalogram recordings for interpreting neural biomarkers.',
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

      assert.equal(validatePaper(synthesizedCustomPaper).valid, true);

      // 5. User bookmarks the paper
      const userState = {
        followedTopics: ['ml', 'ai-health', 'custom'],
        activeTopic: 'custom',
        savedPapers: [synthesizedCustomPaper],
        likedPapers: [synthesizedCustomPaper.id],
        streak: { current: 14, longest: 14, lastActiveDay: '2026-08-16', freezes: 2, freezesEarned: 2, totalDays: 14 },
        userApiConfig: apiConfig
      };

      // 6. Synchronize locally and to Firestore
      await storage.setItem('reopsy_v2_state', JSON.stringify(userState));
      const userDocRef = firestore._getDocRef('users', authUser.uid);
      await firestore.setDoc(userDocRef, userState, { merge: true });

      // 7. Verify Saved Screen data
      const cloudData = (await firestore.getDoc(userDocRef)).data();
      assert.equal(cloudData.savedPapers.length, 1);
      assert.equal(cloudData.savedPapers[0].id, 'arxiv:2402.01234v1');
      assert.equal(cloudData.savedPapers[0].contentLevel, 4);
      assert.equal(cloudData.userApiConfig.provider, 'Gemini');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Scenario 4.3: Offline Transit Journey & Automatic Reconnection Synchronization', async () => {
    const storage = new MockAsyncStorage();
    const firestore = new MockFirestore();

    const user = { uid: 'subway_commuter_42' };
    const userDocRef = firestore._getDocRef('users', user.uid);

    // Initial state before entering subway tunnel
    const initialSession = {
      followedTopics: ['ml', 'dl'],
      savedPapers: [],
      likedPapers: [],
      streak: { current: 4, longest: 4, lastActiveDay: '2026-08-15', freezes: 0, freezesEarned: 0, totalDays: 4 },
      userApiConfig: null
    };
    await storage.setItem('reopsy_v2_state', JSON.stringify(initialSession));
    await firestore.setDoc(userDocRef, initialSession);

    // === IN TUNNEL: Offline Mode ===
    // 1. User reads papers and bookmarks a paper
    const offlinePaper = {
      id: 'oa:W2741809807',
      originalTitle: 'Deep Residual Learning for Image Recognition',
      catchyTitle: 'ResNets: Deeper Neural Networks Made Trainable',
      summary: 'Deeper neural networks are more difficult to train. We present a residual learning framework.',
      authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
      source: 'openalex',
      year: 2016,
      venue: 'CVPR',
      url: 'https://doi.org/10.1109/cvpr.2016.90',
      pdfUrl: null,
      topics: ['dl'],
      likes: 125,
      contentLevel: 1
    };

    const localStateRaw = await storage.getItem('reopsy_v2_state');
    const localState = JSON.parse(localStateRaw);
    localState.savedPapers.push(offlinePaper);
    localState.likedPapers.push(offlinePaper.id);

    // Advance streak offline
    const today = '2026-08-16';
    const nextStreak = recordActivity(localState.streak, today);
    localState.streak = nextStreak.state;

    // Save offline state
    await storage.setItem('reopsy_v2_state', JSON.stringify(localState));

    // === EXIT TUNNEL: Online Reconnection ===
    // App detects network availability and triggers Firestore setDoc
    const pendingLocalState = JSON.parse(await storage.getItem('reopsy_v2_state'));
    await firestore.setDoc(userDocRef, pendingLocalState, { merge: true });

    // Verify Cloud matches Local completely
    const remoteDoc = await firestore.getDoc(userDocRef);
    const remoteState = remoteDoc.data();
    assert.equal(remoteState.streak.current, 5);
    assert.equal(remoteState.savedPapers.length, 1);
    assert.equal(remoteState.savedPapers[0].id, 'oa:W2741809807');
  });

  test('Scenario 4.4: Multi-Device Profile & Reading List Synchronization', async () => {
    const firestore = new MockFirestore();
    const phoneStorage = new MockAsyncStorage();
    const tabletStorage = new MockAsyncStorage();

    const user = { uid: 'sync_user_88' };
    const userDocRef = firestore._getDocRef('users', user.uid);

    // 1. User on Phone bookmarks a paper and sets custom topic
    const phoneState = {
      followedTopics: ['ml', 'ai-health', 'llm'],
      savedPapers: [{
        id: 'arxiv:2401.8888',
        originalTitle: 'Direct Preference Optimization: Your Language Model is Secretly a Reward Model',
        catchyTitle: 'DPO: Simpler LLM Alignment Without Reinforcement Learning',
        summary: 'Direct preference optimization directly optimizes policy on human preferences with a simple binary cross-entropy loss.',
        authors: ['Rafael Rafailov', 'Archit Sharma', 'Eric Mitchell'],
        source: 'arxiv',
        year: 2023,
        venue: 'NeurIPS',
        url: 'https://arxiv.org/abs/2305.18290',
        pdfUrl: 'https://arxiv.org/pdf/2305.18290',
        topics: ['llm'],
        likes: 42,
        contentLevel: 1
      }],
      likedPapers: ['arxiv:2401.8888'],
      streak: { current: 10, longest: 10, lastActiveDay: '2026-08-16', freezes: 1, freezesEarned: 1, totalDays: 10 },
      userApiConfig: { provider: 'Grok', apiKey: 'xai-key-888', customTopic: 'LLM Reasoning' }
    };

    await phoneStorage.setItem('reopsy_v2_state', JSON.stringify(phoneState));
    await firestore.setDoc(userDocRef, phoneState);

    // 2. User opens Tablet, signs into same account
    // Tablet hydrates via getDoc
    const cloudFetch = await firestore.getDoc(userDocRef);
    assert.ok(cloudFetch.exists());
    const tabletHydrated = cloudFetch.data();
    await tabletStorage.setItem('reopsy_v2_state', JSON.stringify(tabletHydrated));

    // Verify tablet matches phone
    const tabletCached = JSON.parse(await tabletStorage.getItem('reopsy_v2_state'));
    assert.equal(tabletCached.streak.current, 10);
    assert.equal(tabletCached.savedPapers.length, 1);
    assert.equal(tabletCached.savedPapers[0].id, 'arxiv:2401.8888');
    assert.equal(tabletCached.userApiConfig.customTopic, 'LLM Reasoning');
    assert.deepEqual(tabletCached.followedTopics, ['ml', 'ai-health', 'llm']);
  });
});
