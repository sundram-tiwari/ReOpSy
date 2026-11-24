/** Keep a compact preview readable; the full source remains in Details. */
export function fitPreviewText(text: string, width: number, lines: number, scaledFontSize: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (lines < 1 || !clean || width < 24) return '';
  const budget = Math.max(12, Math.floor(width / Math.max(8, scaledFontSize * 0.6)) * lines);
  const length = Array.from(clean).length;
  if (length <= budget) return clean;
  const head = Array.from(clean).slice(0, budget - 1).join('');
  // Prefer a complete authored sentence when it isn't too short for the space.
  const ends = [...head.matchAll(/[.!?](?:[”')\]]+)?(?=\s)/g)];
  const last = ends.at(-1);
  const sentenceEnd = last ? last.index! + last[0].length : 0;
  if (sentenceEnd >= budget * 0.5) return head.slice(0, sentenceEnd);
  const boundary = head.lastIndexOf(' ');
  return head.slice(0, boundary >= budget * 0.5 ? boundary : head.length).trimEnd() + '…';
}
