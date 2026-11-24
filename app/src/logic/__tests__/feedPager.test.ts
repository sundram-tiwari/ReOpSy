import test from 'node:test';
import assert from 'node:assert/strict';
import { feedIndex, swipePage } from '../feedPager';

test('vertical flicks turn exactly one page, in either direction', () => {
  assert.equal(swipePage(2, 5, 550, -500, -2000), 3);
  assert.equal(swipePage(2, 5, 550, 500, 2000), 1);
  assert.equal(swipePage(2, 5, 550, -45, -550), 3);
  assert.equal(swipePage(2, 5, 550, 45, 550), 1);
});

test('small or canceled movement snaps back and the finite deck never loops', () => {
  assert.equal(swipePage(2, 5, 550, -20, -40), 2);
  assert.equal(swipePage(2, 5, 550, 20, -1000), 2);
  assert.equal(swipePage(2, 5, 550, -5, -1500), 2);
  assert.equal(swipePage(0, 5, 550, 400, 800), 0);
  assert.equal(swipePage(4, 5, 550, -400, -800), 4);
});

test('a deck refresh keeps the same paper and a triage picks its next neighbor', () => {
  const anchor = { paperId: 'b', deckIndex: 1 };
  const cards = [{ paperId: 'a', deckIndex: 0 }, anchor, { paperId: 'c', deckIndex: 2 }];
  assert.equal(feedIndex(cards), 0);
  assert.equal(feedIndex(cards, anchor), 1);
  assert.equal(feedIndex([cards[2], cards[0], anchor], anchor), 2);
  assert.equal(feedIndex([cards[0], cards[2]], anchor), 1);
  assert.equal(feedIndex([cards[0]], anchor), 0);
  assert.equal(feedIndex([], anchor), -1);
});
