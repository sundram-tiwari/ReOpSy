import { Paper } from '../types';
import { addDays, dayKey } from './date';

export type FeedOrigin = 'live' | 'sample';
export type BriefEntry = { paper: Paper; topic: string; published: string; finding: string };
export type DailyBrief = { today: number; recent: number; entries: BriefEntry[] };

export function validFeedTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function feedStatus(origin: FeedOrigin, generatedAt: string | null, today: string): 'sample' | 'updated' | 'earlier' | 'unknown' {
  if (origin === 'sample') return 'sample';
  const stamp = validFeedTimestamp(generatedAt);
  if (!stamp) return 'unknown';
  const feedDay = dayKey(new Date(stamp));
  if (feedDay > today) return 'unknown';
  return feedDay === today ? 'updated' : 'earlier';
}

/** The deck date is not a publication date. Keep the header and brief in agreement. */
export const FEED_LABELS = {
  sample: { short: 'Sample feed', detail: 'Sample feed · not a live update' },
  updated: { short: 'Feed updated', detail: 'Live feed updated today' },
  earlier: { short: 'Earlier feed', detail: 'Live feed from an earlier update' },
  unknown: { short: 'Update unverified', detail: 'Last live update not verified' },
} as const;

function publicationDay(value: Paper['published']): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return null;
  const key = value.slice(0, 10);
  const parsed = new Date(key + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === key ? key : null;
}

function citeKey(paper: Paper): string {
  const doi = paper.doi?.trim().toLowerCase().replace(/^(doi:\s*|https?:\/\/(dx\.)?doi\.org\/)/, '');
  return doi ? 'doi:' + doi : paper.id;
}

/** Report paper-level evidence, not a generated conclusion about the entire field. */
export function buildDailyBrief(papersByTopic: Record<string, Paper[]>, followed: string[], day: string, limit = 6): DailyBrief {
  const seen = new Set<string>();
  const all: BriefEntry[] = [];
  const oldest = addDays(day, -6);
  for (const topic of followed) {
    for (const paper of papersByTopic[topic] || []) {
      const published = publicationDay(paper.published);
      if (!published || published < oldest || published > day || !/^https?:\/\//i.test(paper.url) || !paper.id || paper.source === 'system') continue;
      const key = citeKey(paper);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ paper, topic, published, finding: paper.summaryBasis === 'metadata' ? '' : (paper.summaryParts?.result || paper.summary || '').trim() });
    }
  }
  all.sort((a, b) => b.published.localeCompare(a.published) || a.paper.originalTitle.localeCompare(b.paper.originalTitle));
  return { today: all.filter((entry) => entry.published === day).length, recent: all.length, entries: all.slice(0, limit) };
}
