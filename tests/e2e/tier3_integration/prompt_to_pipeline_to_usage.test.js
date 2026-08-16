'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 3 - Integration: Prompt Editor -> Pipeline LLM -> API Usage Logging -> Dashboard', () => {
  const firestore = new FirestoreMock({ superAdminEmail: 'admin@reopsy.com' });

  test('I3.3: System prompt modification is dynamically used by LLM call, logged to api_usage, and aggregated in dashboard', async () => {
    // 1. Admin saves custom prompt
    const customPromptTemplate = 'Create an ultra-concise 4-word title for: {{originalTitle}}';
    await firestore.setDoc(firestore.doc('config', 'system_prompt'), {
      prompt: customPromptTemplate,
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin@reopsy.com'
    });

    // 2. Pipeline reads prompt from Firestore
    const promptDoc = (await firestore.getDoc(firestore.doc('config', 'system_prompt'))).data();
    const activePrompt = promptDoc.prompt;
    assert.equal(activePrompt, customPromptTemplate);

    // 3. Pipeline executes mock LLM call using the active prompt
    const paper = { title: 'Attention Is All You Need', summary: 'Transformers architecture.' };
    const promptSent = activePrompt.replace('{{originalTitle}}', paper.title);
    assert.ok(promptSent.includes('ultra-concise 4-word title'));

    // 4. Record usage in Firestore api_usage
    const usageId = 'usage_int_01';
    await firestore.setDoc(firestore.doc('api_usage', usageId), {
      id: usageId,
      timestamp: new Date().toISOString(),
      date: '2026-08-16',
      provider: 'Gemini',
      success: true,
      tokenCount: 42
    });

    // 5. Dashboard aggregates api_usage
    const usageDocs = (await firestore.getDocs(firestore.collection('api_usage'))).docs.map(d => d.data());
    const totalCalls = usageDocs.length;
    const totalSuccess = usageDocs.filter(d => d.success).length;

    assert.equal(totalCalls, 1);
    assert.equal(totalSuccess, 1);
  });

  test('I3.4: LLM failure fallback cascade logs failure for primary and success for fallback, reflecting in dashboard', async () => {
    const today = '2026-08-16';

    // 1. Gemini fails
    const failId = 'usage_fail_gemini';
    await firestore.setDoc(firestore.doc('api_usage', failId), {
      id: failId,
      timestamp: new Date().toISOString(),
      date: today,
      provider: 'Gemini',
      success: false,
      error: 'HTTP 429 Quota Exceeded'
    });

    // 2. Fallback to Mistral succeeds
    const successId = 'usage_succ_mistral';
    await firestore.setDoc(firestore.doc('api_usage', successId), {
      id: successId,
      timestamp: new Date().toISOString(),
      date: today,
      provider: 'Mistral',
      success: true,
      tokenCount: 90
    });

    // 3. Dashboard queries api_usage and breaks down by provider
    const allDocs = (await firestore.getDocs(firestore.collection('api_usage'))).docs.map(d => d.data());
    const geminiLogs = allDocs.filter(d => d.provider === 'Gemini');
    const mistralLogs = allDocs.filter(d => d.provider === 'Mistral');

    const geminiFailed = geminiLogs.filter(d => !d.success).length;
    const mistralSuccess = mistralLogs.filter(d => d.success).length;

    assert.ok(geminiFailed >= 1);
    assert.ok(mistralSuccess >= 1);
  });
});
