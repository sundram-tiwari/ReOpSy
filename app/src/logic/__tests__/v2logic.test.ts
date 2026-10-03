import test from 'node:test';
import assert from 'node:assert/strict';
import { Paper, TriageRecord, LibraryEntry } from '../../types';
import { cleanText, isPartialSummary, paperKey, splitSentences, summaryBullets, toCardView } from '../cardView';
import { buildDailyDeck, deckProgress } from '../triage';
import { dueItems, gradeItem, recallPrompt, scheduleNew } from '../recall';
import { citationKeys, csvCell, escapeLatex, toBibTeX, toMatrixCSV, toRIS } from '../exporters';
import { base64UrlEncode, buildSurveyTex } from '../overleaf';

function paper(id: string, over: Partial<Paper> = {}): Paper {
  return {
    id,
    originalTitle: `Title ${id}`,
    catchyTitle: `Title ${id}`,
    summary: 'A finding. More text.',
    authors: ['Ada Lovelace', 'Alan Turing'],
    source: 'arxiv',
    year: 2026,
    url: `https://arxiv.org/abs/${id.replace('arxiv:', '')}`,
    venue: null,
    pdfUrl: null,
    topics: ['t1'],
    likes: 0,
    ...over,
  };
}

test('cleanText strips arXiv LaTeX markup', () => {
  assert.equal(cleanText('recovers ${\\approx}5\\%$ in \\textit{cross-window} (2.5--10\\,s)'), 'recovers ≈5% in cross-window (2.5–10 s)');
});

test('truncated v1 summaries are flagged, not shown as complete', () => {
  assert.equal(isPartialSummary('We present PatientAct, a framework for…'), true);
  const view = toCardView(paper('arxiv:1', { summary: 'We present X, a framework for…' }));
  assert.equal(view.summaryIsPartial, true);
  assert.ok(!view.summary!.endsWith('…'));
});

test('summary bullets: labelled parts for v2, whole sentences for v1', () => {
  const v2 = paper('arxiv:9', {
    summaryParts: { problem: 'P.', approach: 'A.', result: 'R.', limits: 'L.' },
  });
  assert.deepEqual(
    summaryBullets(v2).map((b) => b.label),
    ['Problem', 'Method', 'Result', 'Limits'],
  );
  const v1 = paper('arxiv:10', {
    summary: 'Simulators are too cooperative. We tested 2.5 s windows. We present X, a framework for…',
  });
  const bullets = summaryBullets(v1);
  assert.equal(bullets.length, 2);
  assert.equal(bullets[1].text, 'We tested 2.5 s windows.');
  assert.ok(bullets.every((b) => b.label === null));
  assert.deepEqual(splitSentences('One. Two? three'), ['One.', 'Two? three']);
});

test('paperKey makes DOI ids Firestore-safe', () => {
  assert.ok(!paperKey('doi:10.1000/abc.def').includes('/'));
});

test('daily deck is finite, round-robins topics and keeps today stable', () => {
  const byTopic = {
    a: [paper('a1'), paper('a2'), paper('a3')],
    b: [paper('b1'), paper('b2')],
    c: [paper('c1')],
  };
  const deck = buildDailyDeck({ papersByTopic: byTopic, followed: ['a', 'b'], triage: {}, goal: 3, day: '2026-10-03' });
  assert.equal(deck.length, 3);
  assert.ok(deck.some((d) => d.topic === 'a') && deck.some((d) => d.topic === 'b'));

  const triage: Record<string, TriageRecord> = { [deck[0].paper.id]: { action: 'saved', day: '2026-10-03' } };
  const again = buildDailyDeck({ papersByTopic: byTopic, followed: ['a', 'b'], triage, goal: 3, day: '2026-10-03' });
  assert.deepEqual(again.map((d) => d.paper.id), deck.map((d) => d.paper.id));
  assert.equal(deckProgress(again, triage, '2026-10-03').done, 1);

  const tomorrow = buildDailyDeck({ papersByTopic: byTopic, followed: ['a', 'b'], triage, goal: 3, day: '2026-10-04' });
  assert.ok(!tomorrow.some((d) => d.paper.id === deck[0].paper.id));
});

test('serendipity card comes from an unfollowed topic and is labelled', () => {
  const byTopic = { a: [paper('a1'), paper('a2'), paper('a3'), paper('a4'), paper('a5')], c: [paper('c1')] };
  const deck = buildDailyDeck({ papersByTopic: byTopic, followed: ['a'], triage: {}, goal: 5, day: '2026-10-03' });
  const extra = deck.filter((d) => d.serendipity);
  assert.equal(extra.length, 1);
  assert.equal(extra[0].topic, 'c');
});

test('a full goal is dealt when there is no topic left for serendipity', () => {
  const byTopic = { a: [1, 2, 3, 4, 5, 6].map((n) => paper(`a${n}`)) };
  const deck = buildDailyDeck({ papersByTopic: byTopic, followed: ['a'], triage: {}, goal: 5, day: '2026-10-03' });
  assert.equal(deck.length, 5);
  assert.equal(deck.filter((d) => d.serendipity).length, 0);
});

test('recall follows Leitner intervals and caps daily questions', () => {
  const item = scheduleNew('p', '2026-10-03');
  assert.equal(item.dueOn, '2026-10-04');
  const knew = gradeItem(item, 'knew', '2026-10-04');
  assert.equal(knew.box, 1);
  assert.equal(knew.dueOn, '2026-10-07');
  assert.equal(gradeItem(knew, 'forgot', '2026-10-07').box, 0);
  const queue = ['a', 'b', 'c', 'd'].map((id) => scheduleNew(id, '2026-10-01'));
  assert.equal(dueItems(queue, '2026-10-03').length, 3);
  assert.ok(recallPrompt(paper('x')).question.length > 0);
});

test('exports escape LaTeX once, quote CSV, and dedupe citation keys', () => {
  assert.equal(escapeLatex('a\\b & {c}'), 'a\\textbackslash{}b \\& \\{c\\}');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  const p1 = paper('arxiv:2608.1', { originalTitle: 'Attention study' });
  const p2 = paper('arxiv:2608.2', { originalTitle: 'Attention study again' });
  const keys = citationKeys([p1, p2]);
  assert.notEqual(keys.get(p1.id), keys.get(p2.id));
  const bib = toBibTeX([p1]);
  assert.match(bib, /eprint = \{2608\.1\}/);
  const entries: LibraryEntry[] = [{ paper: p1, status: 'survey', addedOn: '2026-10-03' }];
  assert.match(toRIS(entries), /^TY  - GEN/m);
  assert.match(toMatrixCSV(entries), /^Title,Authors,Year/);
});

test('Overleaf survey embeds the bibliography and base64url is UTF-8 safe', () => {
  const entries: LibraryEntry[] = [{
    paper: paper('arxiv:2608.3'),
    status: 'survey',
    addedOn: '2026-10-03',
    matrix: { task: 'T', method: 'M', data: 'D', metric: 'Acc', result: '90%', limitation: 'L' },
  }];
  const tex = buildSurveyTex(entries, { title: 'My survey' });
  assert.match(tex, /\\begin\{filecontents\*\}\[overwrite\]\{references\.bib\}/);
  assert.match(tex, /90\\%/);
  assert.equal(base64UrlEncode('hi'), 'aGk');
  assert.equal(base64UrlEncode('≈'), '4omI');
});
