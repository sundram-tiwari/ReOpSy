'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAtom, parseArxivId, categoriesToTopics, licenseFromEntry, decodeEntities, buildUrl, fetchTopic,
} = require('../lib/arxiv');

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2401.01234v2</id>
    <published>2024-01-02T18:00:00Z</published>
    <title>Scaling $n$-gram Models with \\emph{Sparse} Attention</title>
    <summary>  We study sparse attention at scale.
      Our method reaches state-of-the-art perplexity on three corpora.
      The approach costs \\$5 per run and needs no retraining.
    </summary>
    <author><name>Ada Lovelace</name></author>
    <author><name>Alan Turing</name></author>
    <arxiv:journal_ref>TACL 2024</arxiv:journal_ref>
    <arxiv:license>http://creativecommons.org/licenses/by/4.0/</arxiv:license>
    <link href="http://arxiv.org/abs/2401.01234v2" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2401.01234v2" rel="related" type="application/pdf"/>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2402.09999v1</id>
    <published>2024-02-14T09:00:00Z</published>
    <title>A Closed Preprint &amp; Its Discontents</title>
    <summary>No licence is declared for this submission.</summary>
    <author><name>Grace Hopper</name></author>
    <link href="http://arxiv.org/abs/2402.09999v1" rel="alternate"/>
    <category term="cs.HC" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

test('parseAtom returns one paper per entry', () => {
  const rows = parseAtom(FEED, 'nlp');
  assert.equal(rows.length, 2);
});

test('LaTeX in titles and abstracts is stripped', () => {
  const [p] = parseAtom(FEED, 'nlp');
  assert.equal(p.title, 'Scaling -gram Models with Sparse Attention');
  assert.ok(!p.summary.includes('\\'), p.summary);
  assert.ok(p.summary.includes('$5'), 'escaped dollar should survive');
});

test('ids, links and dates are extracted', () => {
  const [p] = parseAtom(FEED, 'nlp');
  assert.equal(p.id, 'arxiv:2401.01234');
  assert.equal(p.arxiv_id, '2401.01234');
  assert.equal(p.pdf_url, 'http://arxiv.org/pdf/2401.01234v2');
  assert.equal(p.published_at, '2024-01-02');
  assert.equal(p.year, 2024);
  assert.equal(p.venue, 'TACL 2024');
  assert.deepEqual(p.authors, ['Ada Lovelace', 'Alan Turing']);
});

test('cross-listed categories map to several topics', () => {
  const [p] = parseAtom(FEED, 'nlp');
  assert.ok(p.topics.includes('nlp'));
  assert.ok(p.topics.includes('ml'), JSON.stringify(p.topics));
});

test('a CC-BY submission may show its abstract; an undeclared one may not', () => {
  const [open, closed] = parseAtom(FEED, 'nlp');
  assert.equal(open.license_ok, true);
  assert.ok(open.abstract);
  assert.equal(closed.license_ok, false);
  assert.equal(closed.abstract, null, 'undeclared licence must mean summary only');
  assert.ok(closed.summary.length > 0);
});

test('XML entities are decoded in titles', () => {
  const [, closed] = parseAtom(FEED, 'hci');
  assert.equal(closed.title, 'A Closed Preprint & Its Discontents');
});

test('parseArxivId splits the version off', () => {
  assert.deepEqual(parseArxivId('http://arxiv.org/abs/2401.01234v3'), { id: '2401.01234', version: 3 });
  assert.deepEqual(parseArxivId('http://arxiv.org/abs/cs/0501001'), { id: 'cs/0501001', version: null });
  assert.deepEqual(parseArxivId(null), { id: null, version: null });
});

test('categoriesToTopics ignores categories we do not ship', () => {
  assert.deepEqual(categoriesToTopics(['math.CO']), []);
  assert.deepEqual(categoriesToTopics(['cs.CV']), ['cv']);
});

test('licenseFromEntry only opens for the CC family', () => {
  assert.equal(licenseFromEntry('<arxiv:license>http://creativecommons.org/licenses/by-sa/4.0/</arxiv:license>').licenseOk, true);
  assert.equal(licenseFromEntry('<arxiv:license>http://arxiv.org/licenses/nonexclusive-distrib/1.0/</arxiv:license>').licenseOk, false);
  assert.equal(licenseFromEntry('<entry></entry>').licenseOk, false);
});

test('decodeEntities handles numeric and named references', () => {
  assert.equal(decodeEntities('a &amp; b &#8212; c &#x2014; d'), 'a & b — c — d');
});

test('parseAtom on junk input returns nothing rather than throwing', () => {
  assert.deepEqual(parseAtom('', 'ml'), []);
  assert.deepEqual(parseAtom('<feed></feed>', 'ml'), []);
});

test('buildUrl targets the right categories, newest first', () => {
  const url = buildUrl({ topic: 'cv', limit: 7 });
  const qs = new URLSearchParams(url.split('?')[1]);
  assert.equal(qs.get('search_query'), 'cat:cs.CV');
  assert.equal(qs.get('max_results'), '7');
  assert.equal(qs.get('sortBy'), 'submittedDate');
});

test('fetchTopic parses a stubbed feed offline', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => FEED });
  const rows = await fetchTopic({ topic: 'nlp', fetchImpl });
  assert.equal(rows.length, 2);
});
