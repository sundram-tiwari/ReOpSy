export type FeedDirection = -1 | 1;

export interface FeedAnchor {
  paperId: string;
  deckIndex: number;
}

/** Keep the same paper when possible; if triaged, pick the next unread card. */
export function feedIndex(cards: ReadonlyArray<FeedAnchor>, anchor?: FeedAnchor): number {
  if (cards.length === 0) return -1;
  if (!anchor) return 0;
  const same = cards.findIndex((card) => card.paperId === anchor.paperId);
  if (same >= 0) return same;
  const next = cards.findIndex((card) => card.deckIndex >= anchor.deckIndex);
  return next >= 0 ? next : cards.length - 1;
}

/** Project the last part of a deliberate flick, then turn at most one page. */
export function swipePage(index: number, count: number, height: number, drag: number, velocity: number): number {
  'worklet';
  const threshold = Math.max(50, Math.min(110, height * 0.19));
  const projected = drag + 0.12 * Math.max(-1000, Math.min(1000, velocity));
  if (Math.abs(drag) < 15 || Math.abs(projected) < threshold || Math.sign(drag) !== Math.sign(projected)) return index;
  return Math.max(0, Math.min(count - 1, index + (projected < 0 ? 1 : -1)));
}
