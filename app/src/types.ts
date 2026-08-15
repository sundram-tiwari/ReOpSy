export interface Paper {
  id: string; // 'oa:W2741809807' | 'arxiv:2401.01234'
  originalTitle: string;
  catchyTitle: string;
  summary: string;
  authors: string[];
  source: string;
  year: number | null;
  url: string;
  pdfUrl: string | null;
  topics: string[];
  likes: number;
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
