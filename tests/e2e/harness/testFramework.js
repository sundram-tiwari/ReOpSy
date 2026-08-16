'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const EXPECTED_TOPIC_SLUGS = [
  'llm',
  'cv',
  'nlp',
  'rl',
  'robotics',
  'audio',
  'multimodal',
  'graph',
  'neuro',
  'quantum'
];

/**
 * Creates a valid test paper object
 */
function createTestPaper(topic = 'llm', overrides = {}) {
  const id = overrides.id || `arxiv:${topic}_2026_${Math.random().toString(36).substr(2, 6)}`;
  return {
    id,
    originalTitle: overrides.originalTitle || `Breakthroughs in ${topic.toUpperCase()} Neural Architectures`,
    catchyTitle: overrides.catchyTitle || `Supercharging ${topic.toUpperCase()} with Next-Gen Models`,
    summary: overrides.summary || `This research explores novel state-of-the-art representations for ${topic}.`,
    authors: overrides.authors !== undefined ? overrides.authors : ['Alice Smith', 'Bob Jones'],
    source: overrides.source || 'arxiv',
    year: overrides.year !== undefined ? overrides.year : 2026,
    venue: overrides.venue !== undefined ? overrides.venue : 'NeurIPS',
    url: overrides.url || `https://arxiv.org/abs/${id.replace('arxiv:', '')}`,
    pdfUrl: overrides.pdfUrl !== undefined ? overrides.pdfUrl : `https://arxiv.org/pdf/${id.replace('arxiv:', '')}.pdf`,
    topics: overrides.topics || [topic],
    likes: overrides.likes !== undefined ? overrides.likes : 0
  };
}

/**
 * Creates a sample feed containing papers across all 10 topics
 */
function createSampleDailyFeed(papersPerTopic = 2) {
  const feed = {
    generatedAt: new Date().toISOString(),
    topics: {}
  };
  for (const slug of EXPECTED_TOPIC_SLUGS) {
    feed.topics[slug] = [];
    for (let i = 0; i < papersPerTopic; i++) {
      feed.topics[slug].push(createTestPaper(slug, {
        originalTitle: `${slug.toUpperCase()} Innovation Paper #${i + 1}`
      }));
    }
  }
  return feed;
}

/**
 * Validates a paper structure
 */
function validatePaperStructure(paper) {
  const required = ['id', 'originalTitle', 'catchyTitle', 'summary', 'url'];
  for (const field of required) {
    if (!paper[field] || typeof paper[field] !== 'string') {
      return { valid: false, error: `Missing or invalid string field: ${field}` };
    }
  }
  return { valid: true };
}

module.exports = {
  EXPECTED_TOPIC_SLUGS,
  createTestPaper,
  createSampleDailyFeed,
  validatePaperStructure
};
