'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEvidenceBriefSelector, sourceSentences } = require('../lib/evidenceBrief');

const paper = {
  title: 'A public fixture', license_ok: true, license: 'cc-by', year: 2026,
  abstract: 'Our initial study used a public source data set. The authors report that the intervention reduced processing time in their sample.',
};
const config = { GEMINI_API_KEY: 'fake', GEMINI_SUMMARY_MODEL: 'fixture-model', AI_SUMMARY_REQUEST_LIMIT: '1' };

test('AI may select an excerpt but cannot insert text, and the cap is enforced', async () => {
  let calls = 0;
  const brief = makeEvidenceBriefSelector(config, async (url, req) => {
    calls++;
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
    assert.ok(!url.includes('fake'));
    assert.equal(req.headers['x-goog-api-key'], 'fake');
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '1' }] } }] }) };
  });
  const result = await brief(paper);
  assert.equal(result.basis, 'ai-selected-source-excerpt');
  assert.equal(result.text, 'The authors report that the intervention reduced processing time in their sample.');
  assert.equal((await brief(paper)).basis, 'source-excerpt');
  assert.equal(calls, 1);
});

test('closed, ND and NC material never goes to a provider', async () => {
  const brief = makeEvidenceBriefSelector(config, () => { throw new Error('not allowed'); });
  for (const license of [null, 'cc-by-nc', 'cc-by-nd', 'https://creativecommons.org/licenses/by-nc/4.0/']) {
    const closed = { ...paper, license };
    assert.deepEqual(sourceSentences(closed), []);
    assert.equal((await brief(closed)).basis, 'metadata');
  }
});

test('a quota error disables the provider for this run without requiring paid fallback', async () => {
  let calls = 0;
  const brief = makeEvidenceBriefSelector({ ...config, AI_SUMMARY_REQUEST_LIMIT: '5', XAI_API_KEY: 'fake', XAI_SUMMARY_MODEL: 'fixture-x' },
    async () => { calls++; return { ok: false, status: 429 }; });
  assert.equal((await brief(paper)).basis, 'source-excerpt');
  assert.equal((await brief(paper)).basis, 'source-excerpt');
  assert.equal(calls, 1);
});

test('non-index responses cannot be shown as claims', async () => {
  const brief = makeEvidenceBriefSelector(config, async () => ({
    ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Here are fabricated results.' }] } }] }),
  }));
  assert.equal((await brief(paper)).basis, 'source-excerpt');
});
