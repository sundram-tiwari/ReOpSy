'use strict';
const { normalizeWhitespace, titleKey } = require('./text');
const { summarizeFromMetadata } = require('./summarize');

function publishedDate(work) {
  for (const date of [work.published, work['published-online'], work['published-print']]) {
    const parts = date?.['date-parts']?.[0];
    if (!Array.isArray(parts) || parts.length !== 3 || !parts.every(Number.isInteger)) continue;
    const key = [String(parts[0]).padStart(4, '0'), String(parts[1]).padStart(2, '0'), String(parts[2]).padStart(2, '0')].join('-');
    const parsed = new Date(key + 'T00:00:00Z');
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key) return key;
  }
  return null;
}

function mapManagementWork(work) {
  const doi = typeof work?.DOI === 'string' && /^10\.\d{4,9}\/\S+$/i.test(work.DOI)
    ? work.DOI.toLowerCase() : null;
  const title = normalizeWhitespace(work?.title?.[0] || '');
  const date = work && publishedDate(work);
  if (!doi || !title || !date) return null;
  const authors = (Array.isArray(work.author) ? work.author : [])
    .map((a) => normalizeWhitespace([a.given, a.family].filter(Boolean).join(' ')))
    .filter(Boolean).slice(0, 12);
  const venue = work['container-title']?.[0] || null;
  const year = Number(date.slice(0, 4));
  const topic = 'management-organizations';
  return {
    id: 'doi:' + doi, doi, title, title_key: titleKey(title),
    source: 'crossref', published_at: date, year, venue, authors, topics: [topic],
    abstract: null, license: null, license_ok: false, arxiv_id: null, pdf_url: null,
    url: 'https://doi.org/' + doi,
    summary: summarizeFromMetadata({ title, authors, year, venue, abstractWithheld: true }),
  };
}

async function fetchManagement({ fromDate, untilDate = new Date().toISOString().slice(0, 10), limit = 12, fetchImpl = globalThis.fetch }) {
  const params = new URLSearchParams({
    'query.bibliographic': 'management organizational behavior workplace leadership strategy',
    filter: `from-pub-date:${fromDate},until-pub-date:${untilDate},type:journal-article`,
    rows: String(Math.max(1, Math.min(limit, 25))),
    select: 'DOI,title,published,author,container-title',
  });
  const response = await fetchImpl('https://api.crossref.org/works?' + params, {
    headers: { Accept: 'application/json', 'User-Agent': 'ReOpSy/1.0 (+https://github.com/sundram-tiwari/ReOpSy)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
  const data = await response.json();
  return (data.message?.items || []).map(mapManagementWork)
    .filter((p) => p && p.published_at >= fromDate && p.published_at <= untilDate);
}

module.exports = { fetchManagement, mapManagementWork };
