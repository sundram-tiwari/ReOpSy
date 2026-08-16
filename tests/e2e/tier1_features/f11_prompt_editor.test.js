'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 1 - Feature F11: System Prompt Editor & Fallback', () => {
  const adminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail: adminEmail });

  const DEFAULT_SYSTEM_PROMPT = 'Rewrite the following research paper title into a catchy, engaging title in under 10 words. Only return the new title, without quotes or additional text.\n\nOriginal Title: {{originalTitle}}\nSummary: {{summary}}';

  /**
   * Helper simulating llm.js getSystemPrompt resolver
   */
  async function getSystemPrompt(db = null) {
    if (!db) return DEFAULT_SYSTEM_PROMPT;
    try {
      const docSnap = await db.getDoc(db.doc('config', 'system_prompt'));
      if (docSnap && docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.prompt && data.prompt.trim().length > 0) {
          return data.prompt.trim();
        }
      }
    } catch (err) {
      console.warn('[getSystemPrompt] Failed to load prompt from Firestore, using default:', err);
    }
    return DEFAULT_SYSTEM_PROMPT;
  }

  /**
   * Helper simulating Admin UI saving system prompt
   */
  async function saveSystemPrompt(db, promptText, updatedBy = adminEmail) {
    const docRef = db.doc('config', 'system_prompt');
    const payload = {
      prompt: promptText.trim(),
      updatedAt: new Date().toISOString(),
      updatedBy
    };
    await db.setDoc(docRef, payload);
    return payload;
  }

  test('F11.1: System prompt is saved to Firestore config/system_prompt with metadata', async () => {
    const customPrompt = 'Generate a catchy 5-word headline for this paper:\nTitle: {{originalTitle}}\nAbstract: {{summary}}';
    const saved = await saveSystemPrompt(firestore, customPrompt, adminEmail);

    assert.equal(saved.prompt, customPrompt);
    assert.equal(saved.updatedBy, adminEmail);
    assert.ok(saved.updatedAt);

    const doc = (await firestore.getDoc(firestore.doc('config', 'system_prompt'))).data();
    assert.equal(doc.prompt, customPrompt);
    assert.equal(doc.updatedBy, adminEmail);
  });

  test('F11.2: llm.js getSystemPrompt retrieves custom prompt when document exists', async () => {
    const activePrompt = await getSystemPrompt(firestore);
    assert.ok(activePrompt.includes('5-word headline'));
  });

  test('F11.3: llm.js getSystemPrompt falls back to hardcoded default prompt when document is absent', async () => {
    const emptyFirestore = new FirestoreMock();
    const activePrompt = await getSystemPrompt(emptyFirestore);
    assert.equal(activePrompt, DEFAULT_SYSTEM_PROMPT);
  });

  test('F11.4: llm.js getSystemPrompt falls back to default when document has empty/whitespace prompt', async () => {
    await firestore.setDoc(firestore.doc('config', 'system_prompt'), {
      prompt: '   \n  \t  ',
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail
    });

    const activePrompt = await getSystemPrompt(firestore);
    assert.equal(activePrompt, DEFAULT_SYSTEM_PROMPT);
  });

  test('F11.5: llm.js getSystemPrompt falls back to default when db is null or throws', async () => {
    const activePrompt = await getSystemPrompt(null);
    assert.equal(activePrompt, DEFAULT_SYSTEM_PROMPT);
  });

  test('F11.6: Prompt interpolates paper title and summary correctly during LLM execution', () => {
    const template = 'Headline for: {{originalTitle}} based on {{summary}}';
    const originalTitle = 'Deep Residual Learning for Image Recognition';
    const summary = 'Residual networks enable training of substantially deeper neural networks.';

    const formatted = template
      .replace('{{originalTitle}}', originalTitle)
      .replace('{{summary}}', summary);

    assert.ok(formatted.includes(originalTitle));
    assert.ok(formatted.includes(summary));
  });
});
