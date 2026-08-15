'use strict';

/**
 * Deduplication across sources.
 *
 * The same paper commonly appears three times: as an arXiv preprint, as an
 * OpenAlex record pointing at the preprint, and as an OpenAlex record for the
 * published version. Keys are tried in descending order of confidence:
 *
 *   1. DOI          — authoritative when present
 *   2. arXiv id     — authoritative for preprints
 *   3. title_key    — normalised title, the last resort
 *
 * When two records collide the richer one wins, where "richer" means: has an
 * abstract we are allowed to show, then more citations, then more metadata
 * fields populated, then the published version over the preprint.
 */

function completeness(p) {
  let score = 0;
  if (p.abstract) score += 4;
  if (p.license_ok) score += 2;
  if (p.doi) score += 2;
  if (p.pdf_url) score += 1;
  if (p.venue && p.venue !== 'arXiv preprint') score += 2;
  if (Array.isArray(p.authors) && p.authors.length) score += 1;
  if (p.year) score += 1;
  if (Number.isInteger(p.cited_by_count)) score += 1;
  if (Array.isArray(p.topics)) score += Math.min(p.topics.length, 3);
  return score;
}

/** True when `a` should be kept over `b`. */
function prefer(a, b) {
  const ca = completeness(a);
  const cb = completeness(b);
  if (ca !== cb) return ca > cb;

  const cita = a.cited_by_count || 0;
  const citb = b.cited_by_count || 0;
  if (cita !== citb) return cita > citb;

  // Stable tiebreak so the function is deterministic.
  return String(a.id) <= String(b.id);
}

/** Merge the loser's non-null fields into the winner. Nothing is lost. */
function merge(winner, loser) {
  const out = { ...winner };

  for (const key of ['doi', 'arxiv_id', 'pdf_url', 'venue', 'year', 'published_at', 'license']) {
    if ((out[key] === null || out[key] === undefined || out[key] === '') && loser[key]) {
      out[key] = loser[key];
    }
  }

  // An abstract we may legally show trumps not having one.
  if (!out.abstract && loser.abstract && loser.license_ok) {
    out.abstract = loser.abstract;
    out.license = loser.license;
    out.license_ok = true;
  }

  if (!Number.isInteger(out.cited_by_count) && Number.isInteger(loser.cited_by_count)) {
    out.cited_by_count = loser.cited_by_count;
  }

  out.topics = [...new Set([...(out.topics || []), ...(loser.topics || [])])];

  if (!out.authors || out.authors.length === 0) out.authors = loser.authors || [];

  return out;
}

function keysFor(p) {
  const keys = [];
  if (p.doi) keys.push(`doi:${String(p.doi).toLowerCase()}`);
  if (p.arxiv_id) keys.push(`arx:${String(p.arxiv_id).toLowerCase()}`);
  if (p.title_key) keys.push(`tit:${p.title_key}`);
  return keys;
}

/**
 * Collapse a list of papers. Returns { papers, removed } where `papers` keeps
 * first-seen order of the surviving records.
 */
function dedupe(papers) {
  const byKey = new Map();   // key -> slot index
  const slots = [];          // { paper } | null once merged away
  let removed = 0;

  for (const paper of papers) {
    if (!paper) continue;

    const keys = keysFor(paper);
    let target = -1;
    for (const k of keys) {
      if (byKey.has(k)) { target = byKey.get(k); break; }
    }

    if (target === -1) {
      const index = slots.length;
      slots.push({ paper });
      for (const k of keys) byKey.set(k, index);
      continue;
    }

    const existing = slots[target].paper;
    const winner = prefer(existing, paper) ? merge(existing, paper) : merge(paper, existing);
    slots[target].paper = winner;
    removed += 1;

    // The merged record may expose keys neither input had on its own.
    for (const k of keysFor(winner)) if (!byKey.has(k)) byKey.set(k, target);
  }

  return { papers: slots.map((s) => s.paper), removed };
}

module.exports = { dedupe, prefer, merge, completeness, keysFor };
