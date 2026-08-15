export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDayKey(key: any): boolean {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export function daysBetween(d1: string, d2: string): number {
  const t1 = fromDayKey(d1).getTime();
  const t2 = fromDayKey(d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

export function addDays(key: string, days: number): string {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

export function formatDay(key: string): string {
  const d = fromDayKey(key);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeTime(timeMs: number, nowMs: number = Date.now()): string {
  const diff = nowMs - timeMs;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86400_000) {
      const h = Math.round(diff / 3600_000);
      if (h < 24) return `${h}h ago`;
  }
  if (diff < 2 * 86400_000) return 'yesterday';
  if (diff < 7 * 86400_000) return `${Math.round(diff / 86400_000)} days ago`;
  
  const d = new Date(timeMs);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${m[d.getMonth()]}`;
}
