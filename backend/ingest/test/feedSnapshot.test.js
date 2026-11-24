'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFeedSnapshot } = require('../lib/feedSnapshot');
const paper = (id, attrs = {}) => ({ id, title: id, url: 'https://example.test/' + id, source: 'openalex', topics: ['one', 'two'], published_at: '2026-11-24', ...attrs });

test('snapshot preserves cross-topic membership, leaves empty topics explicit and blocks fake or future items', async () => {
  let calls = 0;
  const out = await makeFeedSnapshot({
    papers: [paper('real', { doi: '10.1/X' }), paper('copy', { doi: 'https://doi.org/10.1/x' }), paper('today+1', { published_at: '2026-11-26' }), paper('fake', { url: '#' })],
    allowedTopics: ['one', 'two', 'empty'], generatedAt: '2026-11-25T00:00:00.000Z',
    select: async () => { calls++; return { text: 'A source finding.', basis: 'source-excerpt' }; },
  });
  assert.equal(calls, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(out.topics).map(([k, v]) => [k, v.map(p => p.id)])), { one: ['real'], two: ['real'], empty: [] });
  assert.equal(out.topics.one[0].published, '2026-11-24');
});
