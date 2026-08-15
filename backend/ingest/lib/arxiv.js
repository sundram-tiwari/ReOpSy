'use strict';

const { stripLatex, normalizeWhitespace, titleKey } = require('./text');
const { summarize } = require('./summarize');
const { TOPICS } = require('./topics');

const API = 'https://export.arxiv.org/api/query';

/**
 * arXiv returns Atom XML. Rather than pull in an XML parser (and its transitive
 * tree) for six element types, this reads the handful of tags we need with
 * anchored regexes. The feed is machine-generated and stable, so this is safe
 * in a way that regex-parsing arbitrary HTML would not be.
 */

function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

function tagText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? normalizeWhitespace(decodeEntities(m[1])) : null;
}

function tagTextAll(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(normalizeWhitespace(decodeEntities(m[1])));
  return out;
}

function attrsOf(tagString) {
  const attrs = {};
  const re = /([a-zA-Z:_-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagString)) !== null) attrs[m[1]] = decodeEntities(m[2]);
  return attrs;
}

/** 'http://arxiv.org/abs/2401.01234v3' -> { id: '2401.01234', version: 3 } */
function parseArxivId(idUrl) {
  if (!idUrl) return { id: null, version: null };
  const m = String(idUrl).match(/abs\/([^\s?]+?)(?:v(\d+))?$/);
  if (!m) return { id: null, version: null };
  return { id: m[1], version: m[2] ? Number(m[2]) : null };
}

/**
 * Map the arXiv primary_category (e.g. 'cs.CL') onto our topic slugs.
 * A paper cross-listed in cs.LG and cs.CL gets both.
 */
function categoriesToTopics(categories) {
  const set = new Set();
  for (const t of Object.values(TOPICS)) {
    const wanted = t.arxivQuery
      .split(/\s+OR\s+/i)
      .map((q) => q.replace(/^cat:/, '').trim());
    if (categories.some((c) => wanted.includes(c))) set.add(t.slug);
  }
  return [...set];
}

/**
 * arXiv submissions carry a licence chosen by the author. The API exposes it
 * only sometimes; when it is absent we must assume "all rights reserved", which
 * means summary-only.
 */
function licenseFromEntry(entryXml) {
  const m = entryXml.match(/<arxiv:license[^>]*>([\s\S]*?)<\/arxiv:license>/);
  const raw = m ? normalizeWhitespace(decodeEntities(m[1])) : null;
  if (!raw) return { license: null, licenseOk: false };

  const lower = raw.toLowerCase();
  const ok = /creativecommons\.org\/(licenses\/by(-sa|-nd)?|publicdomain\/zero)/.test(lower);
  return { license: raw, licenseOk: ok };
}

/** Parse a full Atom feed into ReOpSy paper objects. */
function parseAtom(xml, requestedTopic) {
  if (!xml) return [];

  const entries = [];
  const re = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) entries.push(m[1]);

  return entries.map((e) => parseEntry(e, requestedTopic)).filter(Boolean);
}

function parseEntry(entryXml, requestedTopic) {
  const rawTitle = tagText(entryXml, 'title');
  if (!rawTitle) return null;

  const title = stripLatex(rawTitle);
  if (!title) return null;

  const idUrl = tagText(entryXml, 'id');
  const { id: arxivId } = parseArxivId(idUrl);
  if (!arxivId) return null;

  // <author><name>…</name></author> — take the names in document order.
  const authors = [];
  const authorRe = /<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/g;
  let am;
  while ((am = authorRe.exec(entryXml)) !== null) {
    const name = tagText(am[1], 'name');
    if (name) authors.push(name);
  }

  const abstract = stripLatex(tagText(entryXml, 'summary') || '');
  const published = tagText(entryXml, 'published');
  const year = published ? Number(published.slice(0, 4)) : null;

  // Categories.
  const categories = [];
  const catRe = /<category\b([^>]*)\/?>/g;
  let cm;
  while ((cm = catRe.exec(entryXml)) !== null) {
    const a = attrsOf(cm[1]);
    if (a.term) categories.push(a.term);
  }

  // Links: rel="alternate" is the abs page, title="pdf" is the PDF.
  let url = idUrl || `https://arxiv.org/abs/${arxivId}`;
  let pdfUrl = null;
  let doi = null;
  const linkRe = /<link\b([^>]*)\/?>/g;
  let lm;
  while ((lm = linkRe.exec(entryXml)) !== null) {
    const a = attrsOf(lm[1]);
    if (a.title === 'pdf' && a.href) pdfUrl = a.href;
    else if (a.title === 'doi' && a.href) doi = a.href.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    else if (a.rel === 'alternate' && a.href) url = a.href;
  }
  if (!doi) doi = tagText(entryXml, 'arxiv:doi');

  const journal = tagText(entryXml, 'arxiv:journal_ref');
  const { license, licenseOk } = licenseFromEntry(entryXml);

  const topics = new Set(categoriesToTopics(categories));
  if (requestedTopic) topics.add(requestedTopic);

  return {
    id: `arxiv:${arxivId}`,
    source: 'arxiv',
    title,
    authors: authors.slice(0, 12),
    year: Number.isInteger(year) ? year : null,
    venue: journal || 'arXiv preprint',
    topics: [...topics],
    summary: summarize(abstract, title),
    abstract: licenseOk ? abstract || null : null,
    license,
    license_ok: licenseOk,
    doi: doi || null,
    arxiv_id: arxivId,
    url,
    pdf_url: pdfUrl || `https://arxiv.org/pdf/${arxivId}`,
    cited_by_count: null,
    title_key: titleKey(title),
    published_at: published ? published.slice(0, 10) : null,
  };
}

function buildUrl({ topic, limit = 25, start = 0 }) {
  const t = TOPICS[topic];
  if (!t) throw new Error(`Unknown topic: ${topic}`);

  const params = new URLSearchParams({
    search_query: t.arxivQuery,
    start: String(start),
    max_results: String(Math.min(Math.max(limit, 1), 200)),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  });
  return `${API}?${params.toString()}`;
}

async function fetchTopic({ topic, limit = 25, fetchImpl = fetch }) {
  const url = buildUrl({ topic, limit });

  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'ReOpSy/1.0', Accept: 'application/atom+xml' },
  });
  if (!res.ok) {
    throw new Error(`arXiv ${res.status} ${res.statusText} for topic "${topic}"`);
  }

  const xml = await res.text();
  return parseAtom(xml, topic);
}

module.exports = {
  parseAtom,
  parseEntry,
  parseArxivId,
  categoriesToTopics,
  licenseFromEntry,
  decodeEntities,
  buildUrl,
  fetchTopic,
};
