'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { dedupe, prefer, merge, completeness } = require('../lib/dedupe');
const { validate } = require('../ingest');
const { titleKey } = require('../lib/text');

function paper(over = {}) {
  const title = over.title || 'Attention Is All You Need';
  return {
    id: 'x', source: 'openalex', title, authors: ['A'], year: 2017, venue: 'NeurIPS',
    topics: ['ml'], summary: 'A summary.', abstract: null, license: null, license_ok: false,
    doi: null, arxiv_id: null, url: 'https://example.org/a', pdf_url: null,
    cited_by_count: null, title_key: titleKey(title), published_at: '2017-06-12',
    ...over,
  };
}

test('identical DOIs collapse to one record', () => {
  const { papers, removed } = dedupe([
    paper({ id: 'oa:W1', doi: '10.1/x' }),
    paper({ id: 'oa:W2', doi: '10.1/x' }),
  ]);
  assert.equal(papers.length, 1);
  assert.equal(removed, 1);
});

test('DOI matching is case-insensitive', () => {
  const { papers } = dedupe([paper({ doi: '10.1/ABC' }), paper({ doi: '10.1/abc' })]);
  assert.equal(papers.length, 1);
});

test('the arXiv preprint and the published version merge', () => {
  const pre = paper({
    id: 'arxiv:1706.03762', source: 'arxiv', arxiv_id: '1706.03762',
    venue: 'arXiv preprint', abstract: 'Full text.', license: 'cc-by', license_ok: true,
    pdf_url: 'https://arxiv.org/pdf/1706.03762',
  });
  const pub = paper({ id: 'oa:W1', doi: '10.5555/x', venue: 'NeurIPS', cited_by_count: 90000 });

  const { papers, removed } = dedupe([pre, pub]);
  assert.equal(removed, 1);
  assert.equal(papers.length, 1);

  const [p] = papers;
  assert.equal(p.doi, '10.5555/x', 'DOI from the published record');
  assert.equal(p.arxiv_id, '1706.03762', 'arXiv id survives the merge');
  assert.equal(p.abstract, 'Full text.', 'the licensed abstract is kept');
  assert.equal(p.license_ok, true);
  assert.equal(p.pdf_url, 'https://arxiv.org/pdf/1706.03762');
  assert.equal(p.cited_by_count, 90000);
});

test('title collision merges even with no shared identifier', () => {
  const { papers } = dedupe([
    paper({ id: 'a', title: 'Attention Is All You Need' }),
    paper({ id: 'b', title: 'attention is all you need!' }),
  ]);
  assert.equal(papers.length, 1);
});

test('different papers are left alone', () => {
  const { papers, removed } = dedupe([
    paper({ id: 'a', title: 'Paper One' }),
    paper({ id: 'b', title: 'Paper Two' }),
    paper({ id: 'c', title: 'Paper Three' }),
  ]);
  assert.equal(papers.length, 3);
  assert.equal(removed, 0);
});

test('topics from every duplicate are unioned', () => {
  const { papers } = dedupe([
    paper({ id: 'a', doi: '10.1/x', topics: ['ml'] }),
    paper({ id: 'b', doi: '10.1/x', topics: ['nlp', 'ml'] }),
  ]);
  assert.deepEqual([...papers[0].topics].sort(), ['ml', 'nlp']);
});

test('a transitive chain (doi link, then title link) collapses to one', () => {
  const { papers } = dedupe([
    paper({ id: 'a', doi: '10.1/x', title: 'Same Title' }),
    paper({ id: 'b', arxiv_id: '1234.5678', title: 'Same Title' }),
    paper({ id: 'c', arxiv_id: '1234.5678', title: 'Different Title' }),
  ]);
  assert.equal(papers.length, 1, JSON.stringify(papers.map((p) => p.id)));
});

test('dedupe is order-independent in what it keeps', () => {
  const a = paper({ id: 'a', doi: '10.1/x', abstract: 'text', license_ok: true, license: 'cc-by' });
  const b = paper({ id: 'b', doi: '10.1/x', cited_by_count: 10 });
  const one = dedupe([a, b]).papers[0];
  const two = dedupe([b, a]).papers[0];
  assert.equal(one.abstract, two.abstract);
  assert.equal(one.cited_by_count, two.cited_by_count);
});

test('completeness rewards a shippable abstract over raw citations', () => {
  assert.ok(completeness(paper({ abstract: 'x', license_ok: true })) > completeness(paper({ cited_by_count: 5 })));
});

test('prefer and merge never lose an identifier', () => {
  const a = paper({ id: 'a', doi: '10.1/x' });
  const b = paper({ id: 'b', arxiv_id: '2401.1' });
  const winner = prefer(a, b) ? merge(a, b) : merge(b, a);
  assert.ok(winner.doi && winner.arxiv_id);
});

test('dedupe skips null entries', () => {
  const { papers } = dedupe([null, paper({ id: 'a' }), undefined]);
  assert.equal(papers.length, 1);
});

test('validate rejects the failure modes that would ship a broken card', () => {
  assert.deepEqual(validate(paper()), []);
  assert.ok(validate(paper({ summary: '' })).includes('empty summary'));
  assert.ok(validate(paper({ url: 'notaurl' })).includes('bad url'));
  assert.ok(validate(paper({ abstract: 'text', license_ok: false }))
    .includes('abstract present without open licence'));
  assert.ok(validate(paper({ summary: 'w '.repeat(100) })).includes('summary over budget'));
});
