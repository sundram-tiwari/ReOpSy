import { strict as assert } from 'node:assert';
import test from 'node:test';
import { FEED_LABELS, buildDailyBrief, feedStatus, validFeedTimestamp } from '../dailyBrief';
import { Paper } from '../../types';

const paper = (id: string, published?: string, extra: Partial<Paper> = {}): Paper => ({
  id, published, originalTitle: id, catchyTitle: id, summary: 'A source-grounded claim.',
  authors: ['A. Author'], source: 'arxiv', year: 2026, venue: null,
  url: 'https://example.test/paper/' + id, pdfUrl: null, topics: [], likes: 0, ...extra,
});

test('only valid, cited papers in followed topics within seven days are counted', () => {
  const r = buildDailyBrief({
    management: [paper('new', '2026-11-25'), paper('edge', '2026-11-19'), paper('old', '2026-11-18'), paper('future', '2026-11-26'),
      paper('no date'), paper('bad date', '2026-11-31'), paper('placeholder', '2026-11-25', { url: '#' })],
    other: [paper('other', '2026-11-25')],
  }, ['management'], '2026-11-25');
  assert.equal(r.today, 1);
  assert.equal(r.recent, 2);
  assert.deepEqual(r.entries.map(e => e.paper.id), ['new', 'edge']);
});

test('counts one paper per DOI across topics and preserves the source result', () => {
  const p = paper('a', '2026-11-25', { doi: 'https://doi.org/10.12/x', summaryParts: { result: 'Authors report a result.', approach: '', problem: '', limits: '' } });
  const r = buildDailyBrief({ first: [p], second: [paper('b', '2026-11-25', { doi: '10.12/X' })] }, ['first', 'second'], '2026-11-25');
  assert.equal(r.today, 1);
  assert.equal(r.entries[0].finding, 'Authors report a result.');
  assert.equal(r.entries[0].topic, 'first');
});

test('a sample, invalid timestamp or future snapshot never presents as updated today', () => {
  assert.equal(validFeedTimestamp('bad'), null);
  assert.equal(feedStatus('sample', '2026-11-25T12:00:00Z', '2026-11-25'), 'sample');
  assert.equal(feedStatus('live', '2026-11-29T12:00:00Z', '2026-11-25'), 'unknown');
  assert.equal(feedStatus('live', null, '2026-11-25'), 'unknown');
  assert.equal(feedStatus('live', '2026-11-22T12:00:00Z', '2026-11-25'), 'earlier');
  assert.equal(feedStatus('live', '2026-11-25T12:00:00Z', '2026-11-25'), 'updated');
});

test('bibliographic records appear without turning metadata into a finding', () => {
  const r = buildDailyBrief({ management: [paper('doi-only', '2026-11-25', { summaryBasis: 'metadata' })] }, ['management'], '2026-11-25');
  assert.equal(r.today, 1);
  assert.equal(r.entries[0].finding, '');
});

test('header and brief distinguish an example deck, source refresh, earlier data, and unknown dates', () => {
  const labels = Object.values(FEED_LABELS);
  assert.equal(new Set(labels.map(label => label.short)).size, 4);
  assert.match(FEED_LABELS.sample.short, /sample/i);
  assert.match(FEED_LABELS.updated.short, /feed/i);
  assert.match(FEED_LABELS.earlier.short, /earlier/i);
  assert.match(FEED_LABELS.unknown.short, /unverified/i);
  assert.ok(labels.every(label => !/new papers|papers today/i.test(label.short)));
});
