import assert from 'node:assert/strict';
import { test } from 'node:test';
import { desktopPaperWindow, desktopTodayColumns } from '../desktopToday';

test('columns follow usable space, and short touch landscape keeps the swipe feed', () => {
  assert.equal(desktopTodayColumns(390, 844, true), 0);
  assert.equal(desktopTodayColumns(852, 393, true), 0);
  assert.equal(desktopTodayColumns(768, 1024, true), 2);
  assert.equal(desktopTodayColumns(1024, 700, false), 2);
  assert.equal(desktopTodayColumns(1440, 900, false), 3);
});

test('desktop paging keeps the anchor in view at each width and clamps the final group', () => {
  assert.deepEqual(desktopPaperWindow(4, 7, 3), { start: 3, end: 6, previous: 0, next: 6 });
  assert.deepEqual(desktopPaperWindow(4, 7, 2), { start: 4, end: 6, previous: 2, next: 6 });
  assert.deepEqual(desktopPaperWindow(99, 7, 2), { start: 6, end: 7, previous: 4, next: null });
  assert.deepEqual(desktopPaperWindow(1, 0, 3), { start: 0, end: 0, previous: null, next: null });
});
