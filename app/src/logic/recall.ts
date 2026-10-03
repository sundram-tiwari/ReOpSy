import { Paper, RecallGrade, RecallItem } from '../types';
import { addDays, daysBetween } from './date';
import { cleanText } from './cardView';

/**
 * Spaced recall of saved papers (Leitner boxes).
 *
 * Retrieval practice at widening intervals is what turns "I scrolled past
 * that" into "I know that paper". The schedule is deliberately small: at most
 * three questions a day, so recall never becomes a chore.
 */
export const INTERVALS = [1, 3, 7, 14, 30];
export const MAX_DAILY = 3;

export function scheduleNew(paperId: string, today: string): RecallItem {
  return { paperId, box: 0, dueOn: addDays(today, INTERVALS[0]) };
}

export function gradeItem(item: RecallItem, grade: RecallGrade, today: string): RecallItem {
  let box = item.box;
  if (grade === 'forgot') box = 0;
  else if (grade === 'knew') box = Math.min(box + 1, INTERVALS.length - 1);
  return { paperId: item.paperId, box, dueOn: addDays(today, INTERVALS[box]) };
}

/** Items due today or overdue, oldest first, capped at `max`. */
export function dueItems(queue: RecallItem[], today: string, max: number = MAX_DAILY): RecallItem[] {
  return queue
    .filter((q) => daysBetween(q.dueOn, today) >= 0)
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.paperId.localeCompare(b.paperId)))
    .slice(0, max);
}

function firstSentence(text: string): string {
  const clean = cleanText(text).replace(/(…|\.\.\.)\s*$/, '');
  const m = clean.match(/^(.{20,}?[.!?])(\s|$)/);
  return (m ? m[1] : clean).trim();
}

/**
 * A question and answer for a saved paper. Uses the pipeline's own recall
 * prompt when the paper has one; otherwise asks for the paper's main point,
 * answered from its summary.
 */
export function recallPrompt(paper: Paper): { question: string; answer: string } {
  if (paper.recall && paper.recall.question && paper.recall.answer) {
    return { question: cleanText(paper.recall.question), answer: cleanText(paper.recall.answer) };
  }
  const title = cleanText(paper.headline || paper.originalTitle);
  if (paper.summaryParts && paper.summaryParts.result) {
    return {
      question: `"${title}": what was the main result?`,
      answer: cleanText(paper.summaryParts.result),
    };
  }
  return {
    question: `"${title}": what is this paper about, in one sentence?`,
    answer: firstSentence(paper.summary || '') || 'Open the paper to check.',
  };
}
