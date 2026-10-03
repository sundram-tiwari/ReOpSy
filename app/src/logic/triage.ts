import { Paper, TriageRecord } from '../types';

/**
 * Builds today's finite deck.
 *
 * Rules (PRODUCT-SPEC §2, rules 1 and 2):
 *  - The deck holds at most `goal` cards and then ends. No refills.
 *  - Topics take turns, so one busy topic cannot crowd out the others.
 *  - Papers you decided on before today never come back.
 *  - Papers you decided on today stay in today's deck, so progress is stable
 *    and re-opening the app shows "6 of 10", not a new deck.
 *  - The same inputs on the same day always give the same deck.
 *  - When the deck has room, one labelled card comes from a topic you do not
 *    follow, to keep the feed from narrowing.
 */
export interface DeckCard {
  paper: Paper;
  topic: string;
  serendipity: boolean;
}

export interface DeckInput {
  papersByTopic: Record<string, Paper[]>;
  followed: string[];
  triage: Record<string, TriageRecord>;
  goal: number;
  day: string;
  /** Include one card from an unfollowed topic. Default true. */
  serendipity?: boolean;
}

/** Small deterministic string hash (FNV-1a), for day-seeded ordering. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr;
  const k = by % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

function availableToday(paper: Paper, triage: Record<string, TriageRecord>, day: string): boolean {
  const rec = triage[paper.id];
  return !rec || rec.day === day;
}

export function buildDailyDeck(input: DeckInput): DeckCard[] {
  const { papersByTopic, triage, day } = input;
  const goal = Math.max(1, Math.floor(input.goal));
  const followed = input.followed.filter((t) => Array.isArray(papersByTopic[t]));
  const used = new Set<string>();

  const queues = rotate(followed, hashString(day)).map((topic) => ({
    topic,
    papers: papersByTopic[topic].filter((p) => p && p.id && availableToday(p, triage, day)),
    next: 0,
  }));

  const wantSerendipity = input.serendipity !== false && goal >= 5;
  const deck: DeckCard[] = [];

  const fillTo = (slots: number) => {
    let progressed = true;
    while (deck.length < slots && progressed) {
      progressed = false;
      for (const q of queues) {
        if (deck.length >= slots) break;
        while (q.next < q.papers.length && used.has(q.papers[q.next].id)) q.next++;
        if (q.next < q.papers.length) {
          const paper = q.papers[q.next++];
          used.add(paper.id);
          deck.push({ paper, topic: q.topic, serendipity: false });
          progressed = true;
        }
      }
    }
  };

  fillTo(wantSerendipity ? goal - 1 : goal);

  if (wantSerendipity) {
    const others = Object.keys(papersByTopic)
      .filter((t) => t !== 'global' && !followed.includes(t))
      .sort();
    const pool: DeckCard[] = [];
    for (const topic of others) {
      for (const p of papersByTopic[topic] || []) {
        if (p && p.id && !used.has(p.id) && availableToday(p, triage, day)) {
          pool.push({ paper: p, topic, serendipity: true });
        }
      }
    }
    if (pool.length > 0 && deck.length >= 2) {
      const pick = pool[hashString(`${day}:serendipity`) % pool.length];
      deck.push(pick);
    } else {
      // Nothing outside your topics today: the slot goes to a regular card.
      fillTo(goal);
    }
  }

  return deck;
}

export interface DeckProgress {
  done: number;
  total: number;
  caughtUp: boolean;
  /** Index of the first card not yet decided today, or -1. */
  nextIndex: number;
}

export function deckProgress(deck: DeckCard[], triage: Record<string, TriageRecord>, day: string): DeckProgress {
  let done = 0;
  let nextIndex = -1;
  deck.forEach((card, i) => {
    const rec = triage[card.paper.id];
    if (rec && rec.day === day) done++;
    else if (nextIndex === -1) nextIndex = i;
  });
  return { done, total: deck.length, caughtUp: deck.length > 0 && done === deck.length, nextIndex };
}

/** Counts today's decisions by kind, for the "caught up" summary. */
export function todaySummary(triage: Record<string, TriageRecord>, day: string) {
  const out = { seen: 0, saved: 0, later: 0, survey: 0, notRelevant: 0 };
  for (const rec of Object.values(triage)) {
    if (!rec || rec.day !== day) continue;
    if (rec.action === 'not_relevant') out.notRelevant++;
    else out[rec.action]++;
  }
  return out;
}
