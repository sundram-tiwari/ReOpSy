'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 2 - Boundary: F11 System Prompt Editor & Fallback', () => {
  const DEFAULT_PROMPT = 'Default system prompt for ReOpSy title generation';

  async function resolvePrompt(db) {
    if (!db) return DEFAULT_PROMPT;
    try {
      const snap = await db.getDoc(db.doc('config', 'system_prompt'));
      if (snap && snap.exists()) {
        const p = snap.data()?.prompt;
        if (p && typeof p === 'string' && p.trim().length > 0) {
          return p.trim();
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_PROMPT;
  }

  test('B11.1: Extremely long custom prompts (10,000+ characters) are stored and loaded intact', async () => {
    const firestore = new FirestoreMock();
    const longPrompt = ('Instructions: ' + 'Repeat carefully. '.repeat(600)).trim();

    await firestore.setDoc(firestore.doc('config', 'system_prompt'), {
      prompt: longPrompt,
      updatedAt: new Date().toISOString()
    });

    const loaded = await resolvePrompt(firestore);
    assert.equal(loaded.length, longPrompt.length);
    assert.equal(loaded, longPrompt);
  });

  test('B11.2: Prompts missing template variables handle fallback interpolation safely', () => {
    const promptWithoutPlaceholders = 'Create a short 3-word title.';
    const originalTitle = 'Quantum Error Correction in Neutral Atom Systems';
    const summary = 'We demonstrate fault-tolerant logical qubits.';

    const interpolate = (tpl, title, sum) => {
      if (tpl.includes('{{originalTitle}}')) {
        return tpl.replace('{{originalTitle}}', title).replace('{{summary}}', sum);
      }
      // If no placeholder, append context at bottom
      return `${tpl}\n\nTitle: ${title}\nSummary: ${sum}`;
    };

    const formatted = interpolate(promptWithoutPlaceholders, originalTitle, summary);
    assert.ok(formatted.includes(originalTitle));
    assert.ok(formatted.includes(summary));
  });

  test('B11.3: Prompts with code injection / regex metacharacters / unicode are handled safely', async () => {
    const firestore = new FirestoreMock();
    const trickyPrompt = 'Rewrite title: [a-z]+ (.*?) ${process.env} \\n \\t <script>alert(1)</script>';

    await firestore.setDoc(firestore.doc('config', 'system_prompt'), {
      prompt: trickyPrompt,
      updatedAt: new Date().toISOString()
    });

    const loaded = await resolvePrompt(firestore);
    assert.equal(loaded, trickyPrompt);
  });

  test('B11.4: Firestore connection error during prompt resolution falls back instantly to default prompt', async () => {
    const failingDb = {
      doc: () => ({}),
      getDoc: async () => { throw new Error('Firestore read timeout'); }
    };

    const loaded = await resolvePrompt(failingDb);
    assert.equal(loaded, DEFAULT_PROMPT);
  });

  test('B11.5: Concurrently reading and updating prompt resolves to valid string at all times', async () => {
    const firestore = new FirestoreMock();
    const docRef = firestore.doc('config', 'system_prompt');

    await firestore.setDoc(docRef, { prompt: 'Initial Prompt' });

    const promises = [
      resolvePrompt(firestore),
      firestore.setDoc(docRef, { prompt: 'Updated Prompt' }),
      resolvePrompt(firestore)
    ];

    const results = await Promise.all(promises);
    assert.ok(results[0] === 'Initial Prompt' || results[0] === 'Updated Prompt');
    assert.ok(results[2] === 'Initial Prompt' || results[2] === 'Updated Prompt');
  });
});
