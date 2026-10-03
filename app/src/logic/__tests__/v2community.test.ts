import test from 'node:test';
import assert from 'node:assert/strict';
import { Paper, TriageRecord } from '../../types';
import { prepareFeed, qualityGate } from '../feed';
import { cleanPostText, normalizeOrcid, rateLimit, suggestHandle, validateHandle } from '../social';
import { chunk, toZoteroItem } from '../zotero';
import { milestones, weekRhythm } from '../progress';

function paper(id: string, over: Partial<Paper> = {}): Paper {
  return {
    id,
    originalTitle: 'Autism screening with fNIRS',
    catchyTitle: 'Autism screening with fNIRS',
    summary: 'We study autism classification from fNIRS recordings across many subjects and time windows in detail.',
    authors: ['A B'],
    source: 'arxiv',
    year: 2026,
    url: 'https://arxiv.org/abs/2608.00001',
    venue: 'arXiv preprint',
    pdfUrl: null,
    topics: ['autism'],
    likes: 0,
    ...over,
  };
}

test('quality gate rejects the three failures from the feed audit', () => {
  const embargo = paper('oa:1', { summary: 'The full abstract for this thesis is available in the body of the thesis, and will be available when the embargo expires.', year: 2027 });
  const zenodo = paper('oa:2', { venue: 'Zenodo (CERN European Organization for Nuclear Research)', year: 2029 });
  const offTopic = paper('oa:3', { originalTitle: 'Exoplanet populations', summary: 'A joint transit and radial velocity framework for small planet populations, applied to survey data and simulations.' });
  assert.equal(qualityGate(embargo, 2026), 'future_date');
  assert.equal(qualityGate({ ...embargo, year: 2026 }, 2026), 'placeholder_abstract');
  assert.equal(qualityGate(zenodo, 2026), 'future_date');
  assert.equal(qualityGate({ ...zenodo, year: 2026 }, 2026), 'self_deposit');
  assert.equal(qualityGate(offTopic, 2026, /autis/i), 'off_topic');
  assert.equal(qualityGate(paper('ok'), 2026, /autis/i), null);
});

test('prepareFeed lets curated cards win and files each paper once', () => {
  const base = { autism: [paper('p1'), paper('p2')], other: [paper('p1')] };
  const curated = { autism: [paper('p2', { headline: 'Curated', whyShown: 'x' })] };
  const feed = prepareFeed(base, curated, { autism: 'autis' }, 2026);
  assert.equal(feed.autism[0].headline, 'Curated');
  assert.equal(feed.autism.length, 2);
  assert.equal(feed.other.length, 0);
});

test('handles and ORCID iDs are validated', () => {
  assert.equal(validateHandle('ada_lovelace'), null);
  assert.ok(validateHandle('Ada!'));
  assert.equal(suggestHandle('Ádá Lovelace'), 'ada_lovelace');
  assert.equal(normalizeOrcid('https://orcid.org/0000-0002-1825-0097'), '0000-0002-1825-0097');
  assert.equal(normalizeOrcid('0000-0002-1825-0098'), null);
  assert.equal(normalizeOrcid('000000021694233X'), '0000-0002-1694-233X');
});

test('post text is cleaned and rate limited', () => {
  assert.equal(cleanPostText('  hi\n\n\n\nthere  ', 100), 'hi\n\nthere');
  assert.equal(cleanPostText('   ', 100), null);
  let stamps: number[] | null = [];
  for (let i = 0; i < 5; i++) stamps = rateLimit(stamps!, 1000 + i);
  assert.equal(rateLimit(stamps!, 2000), null);
  assert.ok(rateLimit(stamps!, 1000 + 61_000));
});

test('Zotero items use the right type and fields', () => {
  const pre = toZoteroItem({ paper: paper('arxiv:2608.07567'), status: 'saved', addedOn: '2026-10-03' });
  assert.equal(pre.itemType, 'preprint');
  assert.equal(pre.archiveID, 'arXiv:2608.07567');
  const art = toZoteroItem({ paper: paper('oa:9', { venue: 'Nature' }), status: 'saved', addedOn: '2026-10-03' });
  assert.equal(art.itemType, 'journalArticle');
  assert.equal(art.publicationTitle, 'Nature');
  assert.equal(chunk([1, 2, 3, 4, 5], 2).length, 3);
});

test('rhythm and milestones reflect output', () => {
  const triage: Record<string, TriageRecord> = { a: { action: 'saved', day: '2026-10-03' }, b: { action: 'seen', day: '2026-10-01' } };
  const dots = weekRhythm(triage, '2026-10-03');
  assert.equal(dots.length, 7);
  assert.equal(dots.filter((d) => d.active).length, 2);
  const ms = milestones({ triage, library: [], recallSessions: 0, exports: 1, posts: 0 });
  assert.equal(ms.find((m) => m.id === 'export1')!.done, true);
  assert.equal(ms.find((m) => m.id === 'triage10')!.progress, '2/10');
});
