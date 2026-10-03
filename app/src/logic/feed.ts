import { Paper } from '../types';

/**
 * Client-side feed hygiene.
 *
 * The backend pipeline will own quality gates (PRODUCT-SPEC §6). Until it
 * does, the app refuses the failure modes found in the 2026-10-03 feed audit:
 * future dates, placeholder abstracts, self-deposits, papers that never
 * mention their topic, and the same paper filed under several topics.
 * Showing fewer, relevant cards beats showing a full deck of noise.
 */
export type GateReason = 'future_date' | 'placeholder_abstract' | 'too_short' | 'self_deposit' | 'off_topic';

const PLACEHOLDER = /(abstract (is )?(not )?available|embargo|no abstract|full abstract for this thesis)/i;
const SELF_DEPOSIT = /\b(zenodo|figshare|researchgate|ssrn preprint server)\b/i;

export function qualityGate(paper: Paper, currentYear: number, requiredTerms?: RegExp): GateReason | null {
  if (paper.year && paper.year > currentYear) return 'future_date';
  const summary = (paper.summary || '').trim();
  if (PLACEHOLDER.test(summary)) return 'placeholder_abstract';
  if (!paper.summaryParts && summary.split(/\s+/).filter(Boolean).length < 12) return 'too_short';
  if (paper.venue && SELF_DEPOSIT.test(paper.venue)) return 'self_deposit';
  if (requiredTerms && !paper.whyShown && !requiredTerms.test(`${paper.originalTitle} ${summary}`)) return 'off_topic';
  return null;
}

/**
 * Merges the curated v2 papers over the base feed (same id wins, curated
 * first), applies the gate per topic, and keeps each paper in one topic only.
 */
export function prepareFeed(
  base: Record<string, Paper[]>,
  curated: Record<string, Paper[]>,
  topicTerms: Record<string, string>,
  currentYear: number,
): Record<string, Paper[]> {
  const curatedById = new Map<string, Paper>();
  for (const papers of Object.values(curated)) for (const p of papers) curatedById.set(p.id, p);

  const topics = new Set([...Object.keys(base), ...Object.keys(curated)].filter((t) => t !== 'global'));
  const placed = new Set<string>();
  const out: Record<string, Paper[]> = {};

  for (const topic of [...topics].sort()) {
    const terms = topicTerms[topic] ? new RegExp(topicTerms[topic], 'i') : undefined;
    const list: Paper[] = [];
    const candidates = [...(curated[topic] || []), ...(base[topic] || []).map((p) => curatedById.get(p.id) || p)];
    for (const p of candidates) {
      if (!p || !p.id || placed.has(p.id)) continue;
      const trusted = curatedById.has(p.id);
      if (!trusted && qualityGate(p, currentYear, terms)) continue;
      placed.add(p.id);
      list.push(p);
    }
    out[topic] = list;
  }
  return out;
}
