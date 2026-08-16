'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 4 - Scenario 5: LLM Failure Fallback & API Usage Reporting Journey', () => {
  const superAdminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });

  test('Scenario 5: Simulated Gemini failure cascades to Mistral, logs both attempts to api_usage, and displays in Dashboard', async () => {
    const today = '2026-08-16';

    // Step 1: Pipeline attempts title generation with Gemini -> Fails due to rate limit
    const geminiLogId = `usage_gemini_${Date.now()}`;
    await firestore.setDoc(firestore.doc('api_usage', geminiLogId), {
      id: geminiLogId,
      timestamp: new Date().toISOString(),
      date: today,
      provider: 'Gemini',
      success: false,
      error: 'HTTP 429 Too Many Requests: Resource exhausted'
    });

    // Step 2: Fallback cascade invokes Mistral -> Succeeds and generates title
    const mistralLogId = `usage_mistral_${Date.now()}`;
    await firestore.setDoc(firestore.doc('api_usage', mistralLogId), {
      id: mistralLogId,
      timestamp: new Date().toISOString(),
      date: today,
      provider: 'Mistral',
      success: true,
      tokenCount: 78
    });

    // Step 3: Admin opens API Usage Dashboard tab
    const allLogs = (await firestore.getDocs(firestore.collection('api_usage'))).docs.map(d => d.data());

    // Aggregate summary
    const summary = {
      totalCalls: allLogs.length,
      successes: allLogs.filter(l => l.success).length,
      failures: allLogs.filter(l => !l.success).length
    };

    assert.equal(summary.totalCalls, 2);
    assert.equal(summary.successes, 1);
    assert.equal(summary.failures, 1);

    // Verify daily breakdown table
    const geminiEntry = allLogs.find(l => l.provider === 'Gemini' && l.date === today);
    const mistralEntry = allLogs.find(l => l.provider === 'Mistral' && l.date === today);

    assert.ok(geminiEntry);
    assert.equal(geminiEntry.success, false);
    assert.ok(geminiEntry.error.includes('429'));

    assert.ok(mistralEntry);
    assert.equal(mistralEntry.success, true);
    assert.equal(mistralEntry.tokenCount, 78);
  });
});
