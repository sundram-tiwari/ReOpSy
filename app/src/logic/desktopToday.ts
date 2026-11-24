/** Breakpoints are layout constraints, not device/UA detection. */
export function desktopTodayColumns(width: number, height: number, coarseTouch: boolean): 0 | 2 | 3 {
  // A landscape phone can be wider than a small tablet but lacks reading height.
  if (width < 760 || (coarseTouch && height < 500)) return 0;
  return width >= 1120 ? 3 : 2;
}

/** Keep the anchored paper in its group when changing the number of columns. */
export function desktopPaperWindow(index: number, count: number, columns: 2 | 3) {
  if (count <= 0) return { start: 0, end: 0, previous: null, next: null };
  const anchor = Math.max(0, Math.min(index, count - 1));
  const start = Math.floor(anchor / columns) * columns;
  const end = Math.min(start + columns, count);
  return {
    start,
    end,
    previous: start > 0 ? start - columns : null,
    next: end < count ? end : null,
  };
}
