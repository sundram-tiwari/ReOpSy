'use strict';

const { stripHtml, normalizeWhitespace, titleKey } = require('./text');
const { summarize, summarizeFromMetadata } = require('./summarize');
const { TOPICS } = require('./topics');

const API = 'https://api.openalex.org/works';

/**
 * Licences under which reproducing an abstract verbatim is safe.
 * Anything not on this list gets summary-only treatment. When in doubt the
 * answer is "not on the list" — this is the copyright gate, not a nice-to-have.
 */
const OPEN_LICENSES = new Set([
  'cc0', 'cc-by', 'cc-by-sa', 'cc-by-nd', 'public-domain', 'pd',
]);

function isLicenseOpen(license) {
  if (!license) return false;
  return OPEN_LICENSES.has(String(license).trim().toLowerCase());
}

/**
 * OpenAlex ships abstracts as an inverted index — a map of word to the list of
 * positions it occupies — because of licensing on the full string. Rebuilding
 * it is lossless for word order; punctuation and casing are whatever the
 * publisher supplied.
 *
 *   { "We": [0], "propose": [1], "a": [2, 5] }  ->  "We propose a ... a ..."
 */
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';

  const slots = [];
  let maxPos = -1;

  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (!Number.isInteger(pos) || pos < 0) continue;
      slots[pos] = word;
      if (pos > maxPos) maxPos = pos;
    }
  }
  if (maxPos < 0) return '';

  const words = [];
  for (let i = 0; i <= maxPos; i += 1) {
    if (slots[i] !== undefined) words.push(slots[i]);
  }
  return normalizeWhitespace(stripHtml(words.join(' ')));
}

/** Bare id from an OpenAlex URI: 'https://openalex.org/W123' -> 'W123'. */
function shortId(uri) {
  if (!uri) return null;
  const m = String(uri).match(/([WwAaIiCcSs]\d+)\s*$/);
  return m ? m[1] : String(uri);
}

/** 'https://doi.org/10.1/xyz' -> '10.1/xyz' */
function bareDoi(doi) {
  if (!doi) return null;
  return String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim() || null;
}

/** A link that is always safe to open, even when the metadata is thin. */
function scholarFallback(title) {
  return 'https://scholar.google.com/scholar?q=' + encodeURIComponent(normalizeWhitespace(title));
}

/**
 * Map one OpenAlex `work` onto the ReOpSy paper shape.
 * Returns null for records that are not worth a card (no title).
 */
function mapWork(work, requestedTopic) {
  if (!work || !work.title && !work.display_name) return null;

  const title = normalizeWhitespace(work.title || work.display_name);
  if (!title) return null;
  if (work.publication_year > new Date().getFullYear()) return null;

  const id = shortId(work.id);
  if (!id) return null;

  const authors = (work.authorships || [])
    .map((a) => (a && a.author && (a.author.display_name || a.raw_author_name)) || '')
    .map(normalizeWhitespace)
    .filter(Boolean)
    .slice(0, 12);

  const loc = work.primary_location || work.best_oa_location || null;
  const source = loc && loc.source ? loc.source : null;
  const venue = source ? normalizeWhitespace(source.display_name || '') || null : null;

  const license = (loc && loc.license) || (work.best_oa_location && work.best_oa_location.license) || null;
  const licenseOk = isLicenseOpen(license);

  const abstract = reconstructAbstract(work.abstract_inverted_index);

  const summary = abstract
    ? summarize(abstract, title)
    : summarizeFromMetadata({ title, authors, year: work.publication_year, venue });

  // Topics: whichever of our slugs the work's concepts match, plus the topic
  // we asked for (so a card never lands in the deck with an empty topic list).
  const conceptIds = new Set(
    (work.concepts || []).map((c) => shortId(c && c.id)).filter(Boolean)
  );
  const topics = new Set();
  for (const t of Object.values(TOPICS)) {
    const wanted = t.openalexFilter.split(':')[1];
    if (conceptIds.has(wanted)) topics.add(t.slug);
  }
  if (requestedTopic) topics.add(requestedTopic);

  const doi = bareDoi(work.doi);
  const pdfUrl = (work.best_oa_location && work.best_oa_location.pdf_url) || null;

  const url = doi
    ? `https://doi.org/${doi}`
    : (loc && loc.landing_page_url) || scholarFallback(title);

  return {
    id: `oa:${id}`,
    source: 'openalex',
    title,
    authors,
    year: Number.isInteger(work.publication_year) ? work.publication_year : null,
    venue,
    topics: [...topics],
    summary,
    abstract: licenseOk ? abstract || null : null,
    license: license || null,
    license_ok: licenseOk,
    doi,
    arxiv_id: null,
    url,
    pdf_url: pdfUrl,
    cited_by_count: Number.isInteger(work.cited_by_count) ? work.cited_by_count : null,
    title_key: titleKey(title),
    published_at: work.publication_date || null,
  };
}

/** Build the request URL. Exported so the tests can assert on it offline. */
function buildUrl({ topic, limit = 25, fromDate, mailto }) {
  const t = TOPICS[topic];
  if (!t) throw new Error(`Unknown topic: ${topic}`);

  const filters = [t.openalexFilter, 'has_abstract:true', 'type:article'];
  if (fromDate) filters.push(`from_publication_date:${fromDate}`);

  const params = new URLSearchParams({
    filter: filters.join(','),
    sort: 'publication_date:desc',
    'per-page': String(Math.min(Math.max(limit, 1), 200)),
    select: [
      'id', 'doi', 'title', 'display_name', 'publication_year', 'publication_date',
      'authorships', 'primary_location', 'best_oa_location', 'concepts',
      'cited_by_count', 'abstract_inverted_index', 'type',
    ].join(','),
  });
  if (mailto) params.set('mailto', mailto);

  return `${API}?${params.toString()}`;
}

async function fetchTopic({ topic, limit = 25, fromDate, mailto, fetchImpl = fetch }) {
  const url = buildUrl({ topic, limit, fromDate, mailto });

  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': `ReOpSy/1.0 (${mailto || 'https://github.com/reopsy'})`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`OpenAlex ${res.status} ${res.statusText} for topic "${topic}"`);
  }

  const json = await res.json();
  const results = Array.isArray(json.results) ? json.results : [];
  return results.map((w) => mapWork(w, topic)).filter(Boolean);
}

module.exports = {
  reconstructAbstract,
  mapWork,
  buildUrl,
  fetchTopic,
  isLicenseOpen,
  shortId,
  bareDoi,
  scholarFallback,
  OPEN_LICENSES,
};

