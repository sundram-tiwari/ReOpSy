/**
 * Validation and small helpers for the research community features.
 * The same limits are enforced again in app/firestore.rules; keep them in sync.
 */
export const LIMITS = {
  name: 60,
  handleMin: 3,
  handleMax: 24,
  role: 60,
  affiliation: 80,
  bio: 280,
  interests: 10,
  comment: 1000,
  post: 2000,
  note: 280,
  circleName: 60,
  circleDescription: 280,
  reportNote: 500,
};

export const ROLES = ['PhD student', 'Masters student', 'Researcher', 'Faculty', 'Industry', 'Enthusiast'];

export const REPORT_REASONS = [
  { key: 'spam', label: 'Spam or self-promotion' },
  { key: 'harassment', label: 'Harassment or hate' },
  { key: 'misinformation', label: 'Misleading scientific claim' },
  { key: 'plagiarism', label: 'Plagiarism or copyright' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

export const SUMMARY_REPORT_REASONS = [
  { key: 'wrong_number', label: 'A number is wrong' },
  { key: 'overclaims', label: 'It overstates the finding' },
  { key: 'off_topic', label: 'Wrong topic' },
  { key: 'other', label: 'Something else' },
] as const;

export type SummaryReportReason = (typeof SUMMARY_REPORT_REASONS)[number]['key'];

const HANDLE_RE = /^[a-z0-9_]+$/;

export function validateHandle(handle: string): string | null {
  if (handle.length < LIMITS.handleMin) return `At least ${LIMITS.handleMin} characters.`;
  if (handle.length > LIMITS.handleMax) return `At most ${LIMITS.handleMax} characters.`;
  if (!HANDLE_RE.test(handle)) return 'Use lowercase letters, numbers and underscores only.';
  return null;
}

/** Suggests a handle from a display name: "Ada Lovelace" -> "ada_lovelace". */
export function suggestHandle(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, LIMITS.handleMax);
  return base.length >= LIMITS.handleMin ? base : `${base}_rs`.slice(0, LIMITS.handleMax);
}

/**
 * ORCID iD check (ISO 7064 MOD 11-2), e.g. 0000-0002-1825-0097.
 * Returns the normalised iD, or null when it is not a valid ORCID.
 */
export function normalizeOrcid(input: string): string | null {
  const raw = input.trim().replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
  const m = raw.match(/^(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])$/);
  if (!m) return null;
  const digits = m.slice(1).join('');
  let total = 0;
  for (let i = 0; i < 15; i++) total = (total + Number(digits[i])) * 2;
  const result = (12 - (total % 11)) % 11;
  const check = result === 10 ? 'X' : String(result);
  if (check !== digits[15]) return null;
  return `${m[1]}-${m[2]}-${m[3]}-${m[4]}`;
}

/** Trims and collapses blank lines; returns null when nothing is left. */
export function cleanPostText(text: string, max: number): string | null {
  const t = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!t) return null;
  return t.slice(0, max);
}

/**
 * Client-side rate limit: at most `max` actions per `windowMs`.
 * Returns the updated timestamp list, or null when the action must wait.
 */
export function rateLimit(stamps: number[], now: number, max = 5, windowMs = 60_000): number[] | null {
  const recent = stamps.filter((t) => now - t < windowMs);
  if (recent.length >= max) return null;
  return [...recent, now];
}
