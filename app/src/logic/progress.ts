import { LibraryEntry, TriageRecord } from '../types';
import { addDays } from './date';

/**
 * Weekly rhythm and milestones. Milestones reward output (papers triaged,
 * surveys built, exports made), never time spent in the app.
 */
export interface DayDot {
  day: string;
  active: boolean;
}

/** The last 7 days, oldest first, marking days with at least one decision. */
export function weekRhythm(triage: Record<string, TriageRecord>, today: string, recallDays: string[] = []): DayDot[] {
  const active = new Set<string>(recallDays);
  for (const rec of Object.values(triage)) if (rec && rec.day) active.add(rec.day);
  const dots: DayDot[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    dots.push({ day, active: active.has(day) });
  }
  return dots;
}

export interface Milestone {
  id: string;
  label: string;
  done: boolean;
  progress: string;
}

export interface MilestoneInput {
  triage: Record<string, TriageRecord>;
  library: LibraryEntry[];
  recallSessions: number;
  exports: number;
  posts: number;
}

export function milestones(input: MilestoneInput): Milestone[] {
  const triaged = Object.values(input.triage).filter(Boolean).length;
  const survey = input.library.filter((e) => e.status === 'survey');
  const filled = survey.filter((e) => {
    const m = e.matrix || e.paper.matrixRow;
    return m && Object.values(m).filter(Boolean).length >= 4;
  }).length;
  const list: [string, string, number, number][] = [
    ['triage10', 'Decide on 10 papers', triaged, 10],
    ['survey1', 'Add a paper to your survey', survey.length, 1],
    ['recall7', 'Finish 7 recall sessions', input.recallSessions, 7],
    ['matrix5', 'Fill 5 rows of your literature matrix', filled, 5],
    ['export1', 'Export your library', input.exports, 1],
    ['discuss1', 'Start a discussion', input.posts, 1],
    ['triage100', 'Decide on 100 papers', triaged, 100],
    ['survey20', 'Build a 20-paper survey', survey.length, 20],
  ];
  return list.map(([id, label, have, need]) => ({
    id,
    label,
    done: have >= need,
    progress: `${Math.min(have, need)}/${need}`,
  }));
}
