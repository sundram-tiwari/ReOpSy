const assert = require('assert');

// Pure state merge function mirror for testing state synchronization logic
function mergeCloudAndLocalState(local, cloud) {
  const initialStreak = {
    current: 0,
    longest: 0,
    lastActiveDay: null,
    freezes: 0,
    freezesEarned: 0,
    totalDays: 0
  };

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

  // 6. Onboarding status
  const mergedOnboarding = Boolean(local.onboardingComplete || cloud.onboardingComplete);

  // 7. Custom feed data
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

console.log("Running Milestone 2 State Synchronization & Hydration Unit Tests...\n");

// Test 1: Empty cloud state preserves local offline state
{
  const local = {
    followedTopics: ['nlp', 'cv'],
    savedPapers: [{ id: 'p1', originalTitle: 'Paper 1', catchyTitle: 'P1', summary: 'S1', authors: ['A'], source: 'arxiv', year: 2026, url: 'http', venue: null, pdfUrl: null, topics: ['nlp'], likes: 5 }],
    likedPapers: ['p1', 'p2'],
    streak: { current: 3, longest: 5, lastActiveDay: '2026-08-15', freezes: 1, freezesEarned: 1, totalDays: 10 },
    onboardingComplete: true,
    userApiConfig: { provider: 'Gemini', apiKey: 'test-key-123' },
    customFeedData: []
  };
  const merged = mergeCloudAndLocalState(local, null);
  assert.deepStrictEqual(merged.followedTopics, ['nlp', 'cv']);
  assert.strictEqual(merged.savedPapers.length, 1);
  assert.deepStrictEqual(merged.likedPapers, ['p1', 'p2']);
  assert.strictEqual(merged.streak.current, 3);
  assert.strictEqual(merged.userApiConfig.apiKey, 'test-key-123');
  console.log("✓ Test 1 Passed: Empty cloud state preserves local offline state");
}

// Test 2: Merging cloud followed topics and saved papers without duplication
{
  const local = {
    followedTopics: ['ml', 'nlp'],
    savedPapers: [{ id: 'p1', catchyTitle: 'P1' }],
    likedPapers: ['p1'],
    streak: { current: 2, longest: 4, lastActiveDay: '2026-08-16', freezes: 0, freezesEarned: 0, totalDays: 5 },
    onboardingComplete: false,
    userApiConfig: null,
    customFeedData: []
  };
  const cloud = {
    followedTopics: ['dl', 'ml', 'robotics'],
    savedPapers: [{ id: 'p1', catchyTitle: 'P1-cloud' }, { id: 'p2', catchyTitle: 'P2' }],
    likedPapers: ['p2', 'p3'],
    streak: { current: 1, longest: 3, lastActiveDay: '2026-08-14', freezes: 1, freezesEarned: 1, totalDays: 8 },
    onboardingComplete: true,
    userApiConfig: { provider: 'Mistral', apiKey: 'cloud-key-456' },
    customFeedData: []
  };
  const merged = mergeCloudAndLocalState(local, cloud);
  
  // Followed topics union: dl, ml, robotics, nlp
  assert.deepStrictEqual(merged.followedTopics, ['dl', 'ml', 'robotics', 'nlp']);
  // Saved papers union: p1 (local), p2 (cloud)
  assert.strictEqual(merged.savedPapers.length, 2);
  assert.strictEqual(merged.savedPapers[0].id, 'p1');
  assert.strictEqual(merged.savedPapers[1].id, 'p2');
  // Liked papers union: p2, p3, p1
  assert.strictEqual(merged.likedPapers.length, 3);
  assert(merged.likedPapers.includes('p1'));
  assert(merged.likedPapers.includes('p2'));
  assert(merged.likedPapers.includes('p3'));
  // Streak: local lastActiveDay is 2026-08-16 (later than 2026-08-14), current should be 2, longest 4, totalDays 8, freezes 1
  assert.strictEqual(merged.streak.current, 2);
  assert.strictEqual(merged.streak.longest, 4);
  assert.strictEqual(merged.streak.lastActiveDay, '2026-08-16');
  assert.strictEqual(merged.streak.totalDays, 8);
  assert.strictEqual(merged.streak.freezes, 1);
  // User API config: local is null, cloud is Mistral key -> restored
  assert.strictEqual(merged.userApiConfig.provider, 'Mistral');
  assert.strictEqual(merged.userApiConfig.apiKey, 'cloud-key-456');
  // Onboarding: true
  assert.strictEqual(merged.onboardingComplete, true);
  console.log("✓ Test 2 Passed: Merging cloud followed topics and saved papers without duplication");
}

// Test 3: Local updated API key takes precedence over older cloud API key
{
  const local = {
    followedTopics: ['ml'],
    savedPapers: [],
    likedPapers: [],
    streak: null,
    onboardingComplete: false,
    userApiConfig: { provider: 'Grok', apiKey: 'new-local-key-789', customTopic: 'Quantum Computing' },
    customFeedData: []
  };
  const cloud = {
    followedTopics: ['ml'],
    savedPapers: [],
    likedPapers: [],
    streak: null,
    onboardingComplete: false,
    userApiConfig: { provider: 'Gemini', apiKey: 'old-cloud-key-111' },
    customFeedData: []
  };
  const merged = mergeCloudAndLocalState(local, cloud);
  assert.strictEqual(merged.userApiConfig.provider, 'Grok');
  assert.strictEqual(merged.userApiConfig.apiKey, 'new-local-key-789');
  assert.strictEqual(merged.userApiConfig.customTopic, 'Quantum Computing');
  console.log("✓ Test 3 Passed: Local updated API key takes precedence over older cloud API key");
}

// Test 4: Default topics fallback when both local and cloud topics are empty
{
  const local = { followedTopics: [], savedPapers: [], likedPapers: [], streak: null, onboardingComplete: false, userApiConfig: null, customFeedData: [] };
  const cloud = { followedTopics: [], savedPapers: [], likedPapers: [], streak: null, onboardingComplete: false, userApiConfig: null, customFeedData: [] };
  const merged = mergeCloudAndLocalState(local, cloud);
  assert.deepStrictEqual(merged.followedTopics, ['ml', 'ai-health']);
  console.log("✓ Test 4 Passed: Default topics fallback when both local and cloud topics are empty");
}

console.log("\nAll Milestone 2 State Synchronization & Hydration tests passed successfully!");
