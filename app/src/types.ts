export interface Paper {
  id: string; // 'oa:W2741809807' | 'arxiv:2401.01234'
  originalTitle: string;
  catchyTitle: string;
  summary: string;
  authors: string[];
  source: string;
  year: number | null;
  url: string;
  venue: string | null;
  pdfUrl: string | null;
  topics: string[];
  likes: number;
  contentLevel?: 1 | 2 | 3 | 4;

  // Card v2 fields (docs/replan/PRODUCT-SPEC.md §4). Optional so v1 feed
  // data keeps working; the card view falls back when they are missing.
  headline?: string;
  summaryParts?: SummaryParts;
  keyNumbers?: KeyNumber[];
  whyShown?: string;
  recall?: { question: string; answer: string };
  matrixRow?: MatrixRow;
  status?: 'preprint' | 'peer-reviewed' | 'accepted' | 'workshop';
  openAccess?: boolean;
  doi?: string | null;
  codeUrl?: string | null;
  published?: string;
  authorCount?: number;
}

export interface SummaryParts {
  problem: string;
  approach: string;
  result: string;
  limits: string;
}

export interface KeyNumber {
  value: string;
  label: string;
}

export interface MatrixRow {
  task: string;
  method: string;
  data: string;
  metric: string;
  result: string;
  limitation: string;
}

export interface Topic {
  slug: string;
  label: string;
  emoji?: string;
  blurb: string | null;
  sortOrder: number;
  active: boolean;
}

export interface StreakState {
  current: number;
  longest: number;
  lastActiveDay: string | null;
  freezes: number;
  freezesEarned: number;
  totalDays: number;
}

export interface UserApiConfig {
  provider: 'Gemini' | 'Mistral' | 'Grok' | 'Custom' | string;
  apiKey: string;
  endpoint?: string;
  customTopic?: string;
}

/** What the reader decided about a card. */
export type TriageAction = 'seen' | 'saved' | 'later' | 'survey' | 'not_relevant';
export type NotRelevantReason = 'off_topic' | 'low_quality' | 'already_know';

export interface TriageRecord {
  action: TriageAction;
  day: string; // YYYY-MM-DD
  reason?: NotRelevantReason;
}

export type LibraryStatus = 'saved' | 'later' | 'survey';

export interface LibraryEntry {
  paper: Paper;
  status: LibraryStatus;
  addedOn: string; // YYYY-MM-DD
  note?: string;
  matrix?: MatrixRow;
}

/** Leitner box for spaced recall of saved papers. */
export interface RecallItem {
  paperId: string;
  box: number;
  dueOn: string; // YYYY-MM-DD
}

export type RecallGrade = 'forgot' | 'fuzzy' | 'knew';
