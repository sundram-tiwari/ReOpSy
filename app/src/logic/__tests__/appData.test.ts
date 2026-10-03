import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, mergeStates, migrate, pruneTriage } from '../appData';
import { Paper } from '../../types';

const p = (id: string): Paper => ({
  id,
  originalTitle: `T ${id}`,
  catchyTitle: `T ${id}`,
  summary: 's',
  authors: [],
  source: 'arxiv',
  year: 2026,
  url: 'u',
  venue: null,
  pdfUrl: null,
  topics: [],
  likes: 0,
});

test('v2 storage migrates without losing saved papers or streak', () => {
  const v2 = {
    followedTopics: ['blockchain', 'global'],
    savedPapers: [p('a'), { bad: true }],
    likedPapers: ['x'],
    streak: { current: 4, longest: 9, lastActiveDay: '2026-10-02', freezes: 1, freezesEarned: 1, totalDays: 12 },
    onboardingComplete: true,
    userApiConfig: { provider: 'Gemini', apiKey: 'secret' },
  };
  const s = migrate(v2, '2026-10-03');
  assert.equal(s.version, 3);
  assert.deepEqual(s.followedTopics, ['blockchain']);
  assert.equal(s.library.length, 1);
  assert.equal(s.library[0].status, 'saved');
  assert.equal(s.streak.longest, 9);
  assert.equal(JSON.stringify(s).includes('secret'), false);
});

test('garbage storage falls back to defaults', () => {
  assert.equal(migrate('nope', '2026-10-03').dailyGoal, 10);
  assert.equal(migrate({ version: 3, dailyGoal: 7 }, '2026-10-03').dailyGoal, 10);
});

test('merge keeps everything collected on both devices', () => {
  const local = { ...defaultState(), onboardingComplete: true, library: [{ paper: p('a'), status: 'saved' as const, addedOn: '2026-10-03' }], triage: { a: { action: 'saved' as const, day: '2026-10-03' } } };
  const cloud = { ...defaultState(), library: [{ paper: p('b'), status: 'survey' as const, addedOn: '2026-10-01' }], triage: { b: { action: 'survey' as const, day: '2026-10-01' } }, exportsCount: 3 };
  const m = mergeStates(local, cloud);
  assert.equal(m.library.length, 2);
  assert.equal(Object.keys(m.triage).length, 2);
  assert.equal(m.exportsCount, 3);
  assert.equal(m.onboardingComplete, true);
});

test('old decisions are pruned before sync', () => {
  const t = pruneTriage({ old: { action: 'seen', day: '2026-01-01' }, recent: { action: 'seen', day: '2026-10-01' } }, '2026-10-03');
  assert.deepEqual(Object.keys(t), ['recent']);
});
