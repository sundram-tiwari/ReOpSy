'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchManagement, mapManagementWork } = require('../lib/crossref');

const work = { DOI: '10.1234/TEST', title: ['Managing knowledge in review teams'], published: { 'date-parts': [[2026, 11, 24]] }, abstract: 'Never reproduce this.', author: [{ given: 'A', family: 'Example' }] };

test('Crossref returns citation metadata only and does not invent missing dates', () => {
  const row = mapManagementWork(work);
  assert.equal(row.doi, '10.1234/test');
  assert.equal(row.url, 'https://doi.org/10.1234/test');
  assert.equal(row.abstract, null);
  assert.doesNotMatch(row.summary, /Never reproduce/);
  assert.equal(mapManagementWork({ ...work, published: { 'date-parts': [[2026, 11]] } }), null);
});

test('fallback only requests bounded public metadata and rejects records outside the published-date window', async () => {
  const rows = await fetchManagement({ fromDate: '2026-11-20', untilDate: '2026-11-25', limit: 2, fetchImpl: async (url) => {
    const u = new URL(url);
    assert.equal(u.hostname, 'api.crossref.org');
    assert.match(u.searchParams.get('filter'), /from-pub-date:2026-11-20,until-pub-date:2026-11-25/);
    assert.doesNotMatch(u.searchParams.get('select'), /abstract/);
    return { ok: true, json: async () => ({ message: { items: [work, { ...work, published: { 'date-parts': [[2026, 11, 30]] } }] } }) };
  } });
  assert.equal(rows.length, 1);
});
