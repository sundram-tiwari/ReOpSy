import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPreviewText } from '../previewText';

test('a narrow single line ends at a word boundary with an explicit ellipsis', () => {
  assert.equal(fitPreviewText('A readable finding should never touch the next control.', 140, 1, 16), 'A readable…');
});

test('uses a complete sentence when it fits, and exposes no truncated text without any room', () => {
  assert.equal(fitPreviewText('The sample improved over baseline. The next sentence has additional context.', 190, 2, 16), 'The sample improved over baseline.');
  assert.equal(fitPreviewText('Nothing fits yet.', 320, 0, 14), '');
});
