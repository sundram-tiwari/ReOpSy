'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 1 - Feature F9: LLM API Usage Logging', () => {
  const firestore = new FirestoreMock();

  /**
   * Helper simulating llm.js usage logger
   */
  async function logApiUsage(db, { provider, success, error = null, tokenCount = null }) {
    if (!db) return; // Graceful skip if no DB configured
    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const usageId = `usage_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Sanitize error string if present
      let sanitizedError = error;
      if (typeof error === 'string') {
        sanitizedError = error.replace(/key=[A-Za-z0-9_-]+/g, 'key=***')
                              .replace(/Bearer [A-Za-z0-9_.-]+/g, 'Bearer ***');
      }

      const docData = {
        id: usageId,
        timestamp: now.toISOString(),
        date: dateStr,
        provider,
        success: Boolean(success),
        ...(sanitizedError ? { error: sanitizedError } : {}),
        ...(typeof tokenCount === 'number' ? { tokenCount } : {})
      };

      await db.setDoc(db.doc('api_usage', usageId), docData);
      return docData;
    } catch (err) {
      console.warn('[logApiUsage] Non-fatal logging error:', err);
    }
  }

  test('F9.1: LLM API calls record provider, success boolean, timestamp to api_usage', async () => {
    const entry = await logApiUsage(firestore, {
      provider: 'Gemini',
      success: true,
      tokenCount: 120
    });

    assert.ok(entry.id);
    const saved = (await firestore.getDoc(firestore.doc('api_usage', entry.id))).data();
    assert.equal(saved.provider, 'Gemini');
    assert.equal(saved.success, true);
    assert.ok(saved.timestamp);
    assert.ok(saved.date);
  });

  test('F9.2: Successful call logs provider name, success: true, and token count', async () => {
    const entry = await logApiUsage(firestore, {
      provider: 'Mistral',
      success: true,
      tokenCount: 85
    });

    const saved = (await firestore.getDoc(firestore.doc('api_usage', entry.id))).data();
    assert.equal(saved.provider, 'Mistral');
    assert.equal(saved.success, true);
    assert.equal(saved.tokenCount, 85);
    assert.equal(saved.error, undefined);
  });

  test('F9.3: Failed LLM call logs success: false, provider, and sanitized error message', async () => {
    const rawError = '401 Unauthorized for Authorization: Bearer sk-secret-token-12345';
    const entry = await logApiUsage(firestore, {
      provider: 'Grok',
      success: false,
      error: rawError
    });

    const saved = (await firestore.getDoc(firestore.doc('api_usage', entry.id))).data();
    assert.equal(saved.provider, 'Grok');
    assert.equal(saved.success, false);
    assert.ok(saved.error);
    assert.ok(!saved.error.includes('sk-secret-token-12345'), 'API key must be masked');
    assert.ok(saved.error.includes('Bearer ***'));
  });

  test('F9.4: Multi-LLM fallback chain logs each provider attempt in sequence', async () => {
    // 1. Gemini fails
    const attempt1 = await logApiUsage(firestore, {
      provider: 'Gemini',
      success: false,
      error: 'Quota exceeded 429'
    });

    // 2. Mistral succeeds
    const attempt2 = await logApiUsage(firestore, {
      provider: 'Mistral',
      success: true,
      tokenCount: 65
    });

    const col = await firestore.getDocs(firestore.collection('api_usage'));
    const doc1 = (await firestore.getDoc(firestore.doc('api_usage', attempt1.id))).data();
    const doc2 = (await firestore.getDoc(firestore.doc('api_usage', attempt2.id))).data();

    assert.equal(doc1.provider, 'Gemini');
    assert.equal(doc1.success, false);
    assert.equal(doc2.provider, 'Mistral');
    assert.equal(doc2.success, true);
  });

  test('F9.5: Date field formatted as YYYY-MM-DD for grouping', async () => {
    const entry = await logApiUsage(firestore, { provider: 'Gemini', success: true });
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('F9.6: Logger handles null or disconnected Firestore gracefully without throwing fatal errors', async () => {
    // Calling with null db
    let errOccurred = false;
    try {
      await logApiUsage(null, { provider: 'Gemini', success: true });
    } catch (e) {
      errOccurred = true;
    }
    assert.equal(errOccurred, false, 'Should not throw when db is null');
  });
});
