'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  reconstructAbstract, mapWork, buildUrl, isLicenseOpen, bareDoi, shortId, fetchTopic,
} = require('../lib/openalex');

test('reconstructAbstract rebuilds word order from the inverted index', () => {
  const inverted = { We: [0], propose: [1], a: [2, 5], new: [3], model: [4], better: [6], one: [7] };
  assert.equal(reconstructAbstract(inverted), 'We propose a new model a better one');
});

test('reconstructAbstract tolerates gaps, junk and empties', () => {
  assert.equal(reconstructAbstract({ a: [0], c: [2] }), 'a c');
  assert.equal(reconstructAbstract({ a: 'nope' }), '');
  assert.equal(reconstructAbstract(null), '');
  assert.equal(reconstructAbstract({}), '');
  assert.equal(reconstructAbstract({ x: [-1] }), '');
});

test('licence gate is closed by default and open only for the CC family', () => {
  assert.equal(isLicenseOpen('cc-by'), true);
  assert.equal(isLicenseOpen('CC0'), true);
  assert.equal(isLicenseOpen('cc-by-nc'), false);   // NC is not on the list
  assert.equal(isLicenseOpen('publisher-specific-oa'), false);
  assert.equal(isLicenseOpen(null), false);
  assert.equal(isLicenseOpen(''), false);
});

test('bareDoi and shortId normalise upstream identifiers', () => {
  assert.equal(bareDoi('https://doi.org/10.1000/abc'), '10.1000/abc');
  assert.equal(bareDoi(null), null);
  assert.equal(shortId('https://openalex.org/W2741809807'), 'W2741809807');
});

const WORK = {
  id: 'https://openalex.org/W2741809807',
  doi: 'https://doi.org/10.7717/peerj.4375',
  title: 'The state of OA: a large-scale analysis',
  publication_year: 2018,
  publication_date: '2018-02-13',
  cited_by_count: 1234,
  authorships: [
    { author: { display_name: 'Heather Piwowar' } },
    { author: { display_name: 'Jason Priem' } },
  ],
  primary_location: {
    license: 'cc-by',
    landing_page_url: 'https://peerj.com/articles/4375/',
    source: { display_name: 'PeerJ' },
  },
  best_oa_location: { license: 'cc-by', pdf_url: 'https://peerj.com/articles/4375.pdf' },
  concepts: [{ id: 'https://openalex.org/C119857082' }],
  abstract_inverted_index: {
    Despite: [0], growing: [1], interest: [2], in: [3], open: [4], access: [5],
    'the': [6], prevalence: [7], remains: [8], unknown: [9],
  },
};

test('mapWork produces a complete paper row', () => {
  const p = mapWork(WORK, 'ml');
  assert.equal(p.id, 'oa:W2741809807');
  assert.equal(p.source, 'openalex');
  assert.equal(p.doi, '10.7717/peerj.4375');
  assert.equal(p.url, 'https://doi.org/10.7717/peerj.4375');
  assert.equal(p.venue, 'PeerJ');
  assert.equal(p.year, 2018);
  assert.deepEqual(p.authors, ['Heather Piwowar', 'Jason Priem']);
  assert.equal(p.license_ok, true);
  assert.ok(p.abstract.startsWith('Despite growing interest'));
  assert.ok(p.summary.length > 0);
  assert.ok(p.topics.includes('ml'));
  assert.equal(p.title_key, 'thestateofoaalargescaleanalysis');
});

test('a closed licence blocks the abstract but still yields a summary', () => {
  const closed = { ...WORK, primary_location: { ...WORK.primary_location, license: 'cc-by-nc' }, best_oa_location: null };
  const p = mapWork(closed, 'ml');
  assert.equal(p.license_ok, false);
  assert.equal(p.abstract, null, 'abstract must not ship without an open licence');
  assert.ok(p.summary.length > 0, 'summary is still allowed');
});

test('a work with no abstract falls back to metadata, never to an empty card', () => {
  const p = mapWork({ ...WORK, abstract_inverted_index: null }, 'ml');
  assert.ok(p.summary.length > 0);
  assert.ok(/no abstract/i.test(p.summary));
});

test('a titleless record is rejected rather than repaired', () => {
  assert.equal(mapWork({ id: 'https://openalex.org/W1' }, 'ml'), null);
  assert.equal(mapWork(null, 'ml'), null);
});

test('buildUrl asks for recent articles with abstracts', () => {
  const url = buildUrl({ topic: 'nlp', limit: 5, fromDate: '2026-01-01', mailto: 'a@b.c' });
  assert.ok(url.startsWith('https://api.openalex.org/works?'));
  const qs = new URLSearchParams(url.split('?')[1]);
  assert.ok(qs.get('filter').includes('has_abstract:true'));
  assert.ok(qs.get('filter').includes('from_publication_date:2026-01-01'));
  assert.equal(qs.get('per-page'), '5');
  assert.equal(qs.get('mailto'), 'a@b.c');
  assert.throws(() => buildUrl({ topic: 'nope' }), /Unknown topic/);
});

test('fetchTopic maps a stubbed response without touching the network', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ results: [WORK, { id: 'x', title: '' }] }),
  });
  const rows = await fetchTopic({ topic: 'ml', limit: 2, fetchImpl });
  assert.equal(rows.length, 1, 'the invalid record is dropped');
  assert.equal(rows[0].id, 'oa:W2741809807');
});

test('fetchTopic surfaces HTTP errors instead of returning nothing', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' });
  await assert.rejects(() => fetchTopic({ topic: 'ml', fetchImpl }), /429/);
});
