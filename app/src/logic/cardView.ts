import { Paper, SummaryParts, KeyNumber } from '../types';

/**
 * Everything a paper card renders, derived from a feed Paper.
 *
 * The feed is mid-migration: v2 papers carry a finding headline and a
 * four-part summary, v1 papers only have a title and an abstract snippet.
 * This adapter hides that difference from the UI, and is honest about it:
 * a v1 snippet that was cut off is flagged as partial instead of being shown
 * as if it were a summary.
 */
export interface CardView {
  id: string;
  headline: string;
  /** Original title, shown under the headline when they differ. */
  originalTitle: string | null;
  parts: SummaryParts | null;
  /** Plain summary text when there are no parts. */
  summary: string | null;
  summaryIsPartial: boolean;
  aiWritten: boolean;
  authorsLine: string;
  metaLine: string;
  chips: CardChip[];
  keyNumbers: KeyNumber[];
  whyShown: string | null;
  links: { abstract: string; pdf: string | null; code: string | null };
}

export type ChipKind = 'status' | 'open' | 'code' | 'venue' | 'serendipity';

export interface CardChip {
  kind: ChipKind;
  label: string;
}

const ELLIPSIS_END = /(…|\.\.\.)\s*$/;

/** Turn the LaTeX that arXiv abstracts carry into readable plain text. */
export function cleanText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/\\(textit|textbf|emph|mathrm|text)\{([^}]*)\}/g, '$2')
    .replace(/\{\\approx\}|\\approx/g, '≈')
    .replace(/\\leq?\b/g, '≤')
    .replace(/\\geq?\b/g, '≥')
    .replace(/\\times\b/g, '×')
    .replace(/\\pm\b/g, '±')
    .replace(/\\%/g, '%')
    .replace(/\\,|\\;|\\ /g, ' ')
    .replace(/(\d)--(\d)/g, '$1–$2')
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a summary was cut off mid-sentence by an older pipeline. */
export function isPartialSummary(text: string | null | undefined): boolean {
  return Boolean(text && ELLIPSIS_END.test(text.trim()));
}

export function formatAuthors(authors: string[] | undefined, authorCount?: number): string {
  const list = (authors || []).filter(Boolean);
  const total = Math.max(authorCount || 0, list.length);
  if (list.length === 0) return 'Unknown authors';
  if (total === 1) return list[0];
  if (total === 2 && list.length >= 2) return `${list[0]} & ${list[1]}`;
  return `${list[0]} et al.`;
}

/** A Firestore-safe document ID for a paper ('/' is not allowed in IDs). */
export function paperKey(id: string): string {
  return encodeURIComponent(id).replace(/\./g, '%2E');
}

function sourceLabel(paper: Paper): string {
  const s = (paper.source || '').toLowerCase();
  if (s === 'arxiv' || paper.id.startsWith('arxiv:')) return 'arXiv';
  if (s === 'openalex' || paper.id.startsWith('oa:')) return 'OpenAlex';
  return paper.source || 'Source';
}

export interface SummaryBullet {
  label: string | null;
  text: string;
}

const BULLET_PARTS: [keyof SummaryParts, string][] = [
  ['problem', 'Problem'],
  ['approach', 'Method'],
  ['result', 'Result'],
  ['limits', 'Limits'],
];

/** Splits on sentence ends followed by a capital, digit or quote, so "2.5 s" stays whole. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    const end = i + 1 === text.length;
    if (end || (text[i + 1] === ' ' && /[A-Z0-9("“]/.test(text[i + 2] || ''))) {
      out.push(text.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/**
 * A few short bullets for the shorts feed: deliberately limited, with the
 * full paper one tap away. Structured papers use their labelled parts; older
 * papers are split into whole sentences, and a sentence an earlier pipeline
 * cut off is dropped instead of shown half-finished.
 */
export function summaryBullets(paper: Paper, max = 4): SummaryBullet[] {
  if (paper.summaryParts) {
    return BULLET_PARTS.map(([key, label]) => ({ label, text: cleanText(paper.summaryParts![key]) }))
      .filter((b) => b.text)
      .slice(0, max);
  }
  const raw = cleanText(paper.summary).replace(ELLIPSIS_END, '').trim();
  if (!raw) return [];
  let sentences = splitSentences(raw);
  const last = sentences[sentences.length - 1];
  if (isPartialSummary(paper.summary) && sentences.length > 1 && !/[.!?]$/.test(last)) {
    sentences = sentences.slice(0, -1);
  }
  return sentences.slice(0, Math.min(max, 3)).map((text) => ({ label: null, text }));
}

export function toCardView(paper: Paper, opts: { serendipity?: boolean } = {}): CardView {
  const originalTitle = cleanText(paper.originalTitle);
  const headline = cleanText(paper.headline || paper.catchyTitle || paper.originalTitle) || originalTitle;
  const parts = paper.summaryParts
    ? {
        problem: cleanText(paper.summaryParts.problem),
        approach: cleanText(paper.summaryParts.approach),
        result: cleanText(paper.summaryParts.result),
        limits: cleanText(paper.summaryParts.limits),
      }
    : null;

  const rawSummary = parts ? null : cleanText(paper.summary);
  const summaryIsPartial = !parts && isPartialSummary(paper.summary);
  // Drop the dangling ellipsis; the UI says the text is partial instead.
  const summary = rawSummary ? rawSummary.replace(ELLIPSIS_END, '').trim() : null;

  const isArxiv = paper.id.startsWith('arxiv:');
  const chips: CardChip[] = [];
  if (opts.serendipity) chips.push({ kind: 'serendipity', label: 'Outside your topics' });
  if (paper.venue && !/arxiv preprint/i.test(paper.venue)) {
    chips.push({ kind: 'venue', label: paper.venue });
  } else if (paper.status === 'preprint' || isArxiv) {
    chips.push({ kind: 'status', label: 'Preprint' });
  }
  if (paper.openAccess || paper.pdfUrl || isArxiv) chips.push({ kind: 'open', label: 'Open PDF' });
  if (paper.codeUrl) chips.push({ kind: 'code', label: 'Code' });

  const meta = [sourceLabel(paper), paper.published || (paper.year ? String(paper.year) : null)]
    .filter(Boolean)
    .join(' · ');

  return {
    id: paper.id,
    headline,
    originalTitle: originalTitle && originalTitle !== headline ? originalTitle : null,
    parts,
    summary,
    summaryIsPartial,
    aiWritten: Boolean(parts || paper.headline),
    authorsLine: formatAuthors(paper.authors, paper.authorCount),
    metaLine: meta,
    chips,
    keyNumbers: paper.keyNumbers || [],
    whyShown: paper.whyShown || null,
    links: { abstract: paper.url, pdf: paper.pdfUrl, code: paper.codeUrl || null },
  };
}
