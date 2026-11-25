import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, mergeStates, migrate, pruneTriage, withPaperLike } from '../appData';
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
  assert.deepEqual(s.paperLikes, { x: { liked: true, updatedAt: 0 } });
  assert.equal(s.library[0].status, 'saved');
  assert.equal(s.streak.longest, 9);
  assert.equal(JSON.stringify(s).includes('secret'), false);
});

test('new, missing or malformed goals inherit the temporary 15-card default', () => {
  assert.equal(defaultState().dailyGoal, 15);
  for (const raw of ['nope', { version: 3 }, { version: 3, dailyGoal: 7 }, { version: 3, dailyGoal: 10, dailyGoalExplicit: false }]) {
    const migrated = migrate(raw, '2026-10-03');
    assert.equal(migrated.dailyGoal, 15);
    assert.equal(migrated.dailyGoalExplicit, false);
  }
});

test('previous 5/10/15 choices survive migration and merging with an inherited default', () => {
  const fresh = { ...defaultState(), onboardingComplete: true };
  for (const goal of [5, 10, 15]) {
    const saved = migrate({ version: 3, onboardingComplete: true, dailyGoal: goal }, '2026-10-03');
    assert.equal(saved.dailyGoal, goal);
    assert.equal(saved.dailyGoalExplicit, true);
    assert.equal(mergeStates(fresh, saved).dailyGoal, goal);
    assert.equal(mergeStates(saved, fresh).dailyGoal, goal);
    assert.equal(mergeStates(fresh, saved).dailyGoalExplicit, true);
  }
  const localChoice = { ...fresh, dailyGoal: 5, dailyGoalExplicit: true };
  const cloudChoice = { ...fresh, dailyGoal: 10, dailyGoalExplicit: true };
  assert.equal(mergeStates(localChoice, cloudChoice).dailyGoal, 5);
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

test('likes are idempotent per paper and survive serializing private app state', () => {
  const base = defaultState();
  assert.strictEqual(withPaperLike(base, 'a', false, 1), base);
  const liked = withPaperLike(base, 'a', true, 1);
  assert.strictEqual(withPaperLike(liked, 'a', true, 2), liked);
  assert.equal(liked.paperLikes.b, undefined);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(liked)), '2026-10-03').paperLikes, { a: { liked: true, updatedAt: 1 } });
  assert.deepEqual(migrate({ version: 3, paperLikes: { a: 'bad', b: { liked: true, updatedAt: 'bad' } } }, '2026-10-03').paperLikes, {});
});

test('private Like merge keeps the latest change per paper without resurrecting unlikes', () => {
  const old = withPaperLike(defaultState(), 'a', true, 10);
  const local = withPaperLike(withPaperLike(old, 'a', false, 11), 'b', true, 4);
  assert.deepEqual(mergeStates(old, local).paperLikes, {
    a: { liked: false, updatedAt: 11 },
    b: { liked: true, updatedAt: 4 },
  });
  assert.deepEqual(mergeStates(local, old).paperLikes, mergeStates(old, local).paperLikes);
  const sameTime = withPaperLike(defaultState(), 'a', true, 11);
  assert.equal(mergeStates(local, sameTime).paperLikes.a.liked, false);
  assert.equal(mergeStates(sameTime, local).paperLikes.a.liked, false);
  assert.equal(withPaperLike(local, 'a', true, 7).paperLikes.a.updatedAt, 12);
});
