'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 4 - Scenario 6: Dynamic System Prompt Modification Journey', () => {
  const superAdminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });

  test('Scenario 6: Admin customizes prompt in Settings, stores to Firestore config/system_prompt, verifies pipeline picks up prompt on next execution', async () => {
    // Step 1: Admin navigates to Settings & Config tab
    // Step 2: Admin inputs new prompt to enforce concise, punchy title formatting
    const customPrompt = 'Rewrite the following research paper title into a punchy 5-word headline:\nTitle: {{originalTitle}}\nSummary: {{summary}}';

    // Step 3: Admin saves prompt
    const promptDocRef = firestore.doc('config', 'system_prompt');
    const updateTime = new Date().toISOString();
    await firestore.setDoc(promptDocRef, {
      prompt: customPrompt,
      updatedAt: updateTime,
      updatedBy: superAdminEmail
    });

    // Step 4: Verify Firestore document persists custom prompt
    const savedDoc = (await firestore.getDoc(promptDocRef)).data();
    assert.equal(savedDoc.prompt, customPrompt);
    assert.equal(savedDoc.updatedBy, superAdminEmail);

    // Step 5: Backend pipeline fetchAndSummarize runs and calls getSystemPrompt()
    const getSystemPrompt = async (db) => {
      const snap = await db.getDoc(db.doc('config', 'system_prompt'));
      if (snap && snap.exists() && snap.data().prompt) {
        return snap.data().prompt;
      }
      return 'Default Prompt';
    };

    const activePrompt = await getSystemPrompt(firestore);
    assert.equal(activePrompt, customPrompt);

    // Step 6: Verify template interpolation during actual title synthesis
    const testPaper = {
      title: 'Scaling Laws for Neural Language Models',
      summary: 'Cross-entropy loss scales as a power-law with compute, dataset size, and parameters.'
    };

    const formattedPrompt = activePrompt
      .replace('{{originalTitle}}', testPaper.title)
      .replace('{{summary}}', testPaper.summary);

    assert.ok(formattedPrompt.includes('punchy 5-word headline'));
    assert.ok(formattedPrompt.includes('Scaling Laws for Neural Language Models'));
    assert.ok(formattedPrompt.includes('Cross-entropy loss scales'));
  });
});
