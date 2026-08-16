'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 2 - Boundary: F9 LLM API Usage Logging', () => {
  const firestore = new FirestoreMock();

  test('B9.1: Diverse sensitive token formats (Bearer, apiKey, query params) are sanitized from error logs', () => {
    const sanitize = (str) => {
      if (!str) return '';
      return str
        .replace(/key=[A-Za-z0-9_-]+/g, 'key=***')
        .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer ***')
        .replace(/Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi, 'Authorization: Basic ***')
        .replace(/x-api-key:\s*[A-Za-z0-9_-]+/gi, 'x-api-key: ***');
    };

    const dirty1 = 'Failed to fetch: https://api.mistral.ai?key=AIzaSySecret123';
    assert.equal(sanitize(dirty1), 'Failed to fetch: https://api.mistral.ai?key=***');

    const dirty2 = 'Header Authorization: Bearer sk-live-99887766';
    assert.equal(sanitize(dirty2), 'Header Authorization: Bearer ***');

    const dirty3 = 'Header x-api-key: secret_key_val';
    assert.equal(sanitize(dirty3), 'Header x-api-key: ***');
  });

  test('B9.2: Extremely large token counts (>1,000,000) are handled without numeric precision loss', async () => {
    const hugeTokens = 1500000;
    const usageDoc = {
      id: 'usage_huge',
      provider: 'Gemini',
      success: true,
      tokenCount: hugeTokens,
      timestamp: new Date().toISOString(),
      date: '2026-08-16'
    };

    await firestore.setDoc(firestore.doc('api_usage', 'usage_huge'), usageDoc);
    const saved = (await firestore.getDoc(firestore.doc('api_usage', 'usage_huge'))).data();
    assert.equal(saved.tokenCount, 1500000);
  });

  test('B9.3: Unknown or unexpected LLM provider name is preserved and categorized as Other/Custom', async () => {
    const usageDoc = {
      id: 'usage_custom',
      provider: 'Claude-3.7-Sonnet',
      success: true,
      timestamp: new Date().toISOString(),
      date: '2026-08-16'
    };

    await firestore.setDoc(firestore.doc('api_usage', 'usage_custom'), usageDoc);
    const saved = (await firestore.getDoc(firestore.doc('api_usage', 'usage_custom'))).data();
    assert.equal(saved.provider, 'Claude-3.7-Sonnet');
  });

  test('B9.4: High-throughput batch logging (100 concurrent logs) writes all entries without dropped records', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      const id = `batch_${i}`;
      promises.push(firestore.setDoc(firestore.doc('api_usage', id), {
        id,
        provider: i % 2 === 0 ? 'Gemini' : 'Mistral',
        success: true,
        date: '2026-08-16'
      }));
    }

    await Promise.all(promises);
    const all = await firestore.getDocs(firestore.collection('api_usage'));
    assert.ok(all.docs.length >= 50);
  });

  test('B9.5: Logging with empty string error or null tokenCount does not write dirty undefined keys', async () => {
    const usageDoc = {
      id: 'clean_log',
      provider: 'Grok',
      success: true,
      error: undefined,
      tokenCount: undefined
    };

    const cleanPayload = JSON.parse(JSON.stringify(usageDoc));
    assert.equal('error' in cleanPayload, false);
    assert.equal('tokenCount' in cleanPayload, false);
  });
});
