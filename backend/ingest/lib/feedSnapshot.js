'use strict';

const { makeEvidenceBriefSelector } = require('./evidenceBrief');

function buildSnapshotItems(papers, allowedTopics, generatedAt) {
  const today = generatedAt.slice(0, 10);
  const topics = Object.fromEntries(allowedTopics.map((topic) => [topic, []]));
  const seen = new Set();
  for (const paper of [...papers].sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')))) {
    if (!paper.id || !paper.title || !/^https?:\/\//i.test(paper.url || '') || paper.source === 'system') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paper.published_at || '') || paper.published_at > today) continue;
    const doi = (paper.doi || '').trim().toLowerCase().replace(/^(doi:\s*|https?:\/\/(dx\.)?doi\.org\/)/, '');
    const key = doi ? 'doi:' + doi : paper.id;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const topic of new Set(paper.topics || [])) {
      if (Object.hasOwn(topics, topic) && topics[topic].length < 12) topics[topic].push(paper);
    }
  }
  return topics;
}

async function makeFeedSnapshot({ papers, allowedTopics, generatedAt = new Date().toISOString(), select = makeEvidenceBriefSelector() }) {
  const groups = buildSnapshotItems(papers, allowedTopics, generatedAt);
  const summaries = new Map();
  const topics = {};
  for (const [slug, rows] of Object.entries(groups)) {
    topics[slug] = [];
    for (const p of rows) {
      if (!summaries.has(p.id)) summaries.set(p.id, await select(p));
      const brief = summaries.get(p.id);
      topics[slug].push({
        id: p.id, originalTitle: p.title, catchyTitle: p.title, summary: brief.text,
        summaryBasis: brief.basis, excerptLicense: brief.basis === 'metadata' ? null : p.license,
        published: p.published_at, doi: p.doi || null, authors: p.authors || [], source: p.source || 'unknown',
        year: p.year || null, venue: p.venue || null, url: p.url, pdfUrl: p.pdf_url || null,
        topics: (p.topics || []).filter((topic) => Object.hasOwn(groups, topic)), likes: 0,
      });
    }
  }
  if (![...Object.values(topics)].some((rows) => rows.length)) return null;
  return { generatedAt, topics };
}

module.exports = { buildSnapshotItems, makeFeedSnapshot };
