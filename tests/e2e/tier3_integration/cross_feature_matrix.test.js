'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  AuthEmulator,
  FirestoreMock,
  DomInspector,
  createSampleDailyFeed
} = require('../harness');

describe('Tier 3 - Integration: Cross-Feature End-to-End Matrix', () => {
  const superAdminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });
  const auth = new AuthEmulator({ superAdminEmail, firestore });
  const inspector = new DomInspector();

  test('I3.11: Comprehensive Admin Workflow: Login -> Settings Edit Prompt -> Trigger Pipeline -> Usage Dashboard -> Flashcard Curation', async () => {
    // 1. Super Admin Signs In
    await auth.signInWithGoogle(superAdminEmail);
    const authState = await auth.getAuthContextState();
    assert.equal(authState.isAdmin, true);
    assert.equal(authState.isSuperAdmin, true);

    // 2. Access Admin Panel via Drawer
    const drawer = inspector.simulateDrawerRender(authState);
    assert.ok(drawer.visibleItems.includes('Mission Control'));
    const nav = inspector.simulateNavigate(authState, 'Admin');
    assert.equal(nav.accessible, true);

    // 3. Edit System Prompt in Settings
    const customPrompt = 'Generate catchy title for: {{originalTitle}}';
    await firestore.setDoc(firestore.doc('config', 'system_prompt'), {
      prompt: customPrompt,
      updatedAt: new Date().toISOString(),
      updatedBy: superAdminEmail
    });

    // 4. Trigger Pipeline Fetch for topic 'graph'
    const queueId = `queue_matrix_${Date.now()}`;
    await firestore.setDoc(firestore.doc('pipeline_queue', queueId), {
      topic: 'graph',
      status: 'pending',
      requestedBy: superAdminEmail,
      requestedAt: new Date().toISOString()
    });

    // 5. Worker processes queue & logs LLM usage
    await firestore.updateDoc(firestore.doc('pipeline_queue', queueId), { status: 'completed' });
    const usageId = `usage_matrix_${Date.now()}`;
    await firestore.setDoc(firestore.doc('api_usage', usageId), {
      id: usageId,
      date: '2026-08-16',
      provider: 'Gemini',
      success: true,
      tokenCount: 75,
      timestamp: new Date().toISOString()
    });

    // 6. Worker logs pipeline run
    const runId = `run_matrix_${Date.now()}`;
    await firestore.setDoc(firestore.doc('pipeline_runs', runId), {
      runId,
      timestamp: new Date().toISOString(),
      topicCounts: { graph: 4 },
      totalPapers: 4,
      errors: [],
      status: 'success'
    });

    // 7. Admin views API Usage Dashboard
    const usageDocs = (await firestore.getDocs(firestore.collection('api_usage'))).docs.map(d => d.data());
    assert.ok(usageDocs.some(u => u.id === usageId));

    // 8. Admin curates generated flashcard in Flashcard Manager
    const feed = createSampleDailyFeed(1);
    feed.topics['graph'][0].catchyTitle = 'Graph Neural Networks Reimagined';
    await firestore.setDoc(firestore.doc('content', 'dailyFeed'), {
      ...feed,
      updatedAt: new Date().toISOString(),
      updatedBy: superAdminEmail
    });

    // 9. Verify Firestore content holds curated title
    const content = (await firestore.getDoc(firestore.doc('content', 'dailyFeed'))).data();
    assert.equal(content.topics['graph'][0].catchyTitle, 'Graph Neural Networks Reimagined');
  });

  test('I3.12: Regular User Experience in Parallel: Feed Consumption -> Zero Admin Traces -> Strict Security Enforcement', async () => {
    // 1. Regular user signs in
    const regularEmail = 'reader@stanford.edu';
    await auth.signInWithGoogle(regularEmail);
    const regularState = await auth.getAuthContextState();
    assert.equal(regularState.isAdmin, false);

    // 2. Regular user views Drawer -> Zero admin leakage
    const drawer = inspector.simulateDrawerRender(regularState);
    const audit = inspector.auditZeroDomLeakage(drawer.domString);
    assert.equal(audit.hasAdminLeak, false);
    assert.equal(drawer.visibleItems.includes('Mission Control'), false);

    // 3. Regular user reads public content/dailyFeed
    const readRule = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', regularState.user);
    assert.equal(readRule.allowed, true, 'Regular user can read public feed');

    // 4. Regular user attempts forbidden actions -> All rejected
    const forbiddenAttempts = [
      firestore.evaluateSecurityRule('write', 'content', 'dailyFeed', regularState.user, {}),
      firestore.evaluateSecurityRule('read', 'admins', 'admin@reopsy.com', regularState.user),
      firestore.evaluateSecurityRule('write', 'config', 'system_prompt', regularState.user, {}),
      firestore.evaluateSecurityRule('write', 'pipeline_queue', 'hacked', regularState.user, {}),
      firestore.evaluateSecurityRule('read', 'api_usage', 'usage_1', regularState.user)
    ];

    const results = await Promise.all(forbiddenAttempts);
    for (const res of results) {
      assert.equal(res.allowed, false, 'Forbidden action must be denied');
    }
  });
});
