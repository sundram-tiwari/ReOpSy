'use strict';

const fs = require('fs');
const path = require('path');

const EXPECTED_TOPIC_SLUGS = [
  'ai-mental-health',
  'autism-diagnosis',
  'blockchain',
  'quantum-communication',
  'surveillance-anomaly-detection'
];

/**
 * Validates paper structure compliance
 */
function validatePaper(paper) {
  const errors = [];
  if (!paper.id || typeof paper.id !== 'string') errors.push('Missing or invalid id');
  if (!paper.originalTitle || typeof paper.originalTitle !== 'string') errors.push('Missing or invalid originalTitle');
  if (!paper.summary || typeof paper.summary !== 'string') errors.push('Missing or invalid summary');
  if (!Array.isArray(paper.authors)) errors.push('authors must be an array');
  if (!paper.url || typeof paper.url !== 'string') errors.push('Missing or invalid url');
  if (!Array.isArray(paper.topics)) errors.push('topics must be an array');
  if (typeof paper.likes !== 'number') errors.push('likes must be a number');

  // Dummy card check
  if (paper.id && paper.id.startsWith('dummy-')) {
    errors.push(`Paper is a placeholder dummy card: ${paper.id}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates dailyFeed.json content
 */
function validateDailyFeed(feedPath) {
  const targetPath = feedPath || path.resolve(__dirname, '../../app/src/data/dailyFeed.json');
  if (!fs.existsSync(targetPath)) {
    return { valid: false, error: `Feed file does not exist: ${targetPath}` };
  }

  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    const data = JSON.parse(raw);

    if (!data.topics || typeof data.topics !== 'object') {
      return { valid: false, error: 'Feed root missing "topics" object' };
    }

    const missingTopics = [];
    const topicStats = {};
    let totalPapers = 0;
    let dummyCount = 0;

    for (const slug of EXPECTED_TOPIC_SLUGS) {
      if (!data.topics[slug]) {
        missingTopics.push(slug);
        continue;
      }

      const papers = data.topics[slug];
      if (!Array.isArray(papers)) {
        return { valid: false, error: `Topic "${slug}" is not an array` };
      }

      topicStats[slug] = papers.length;
      totalPapers += papers.length;

      for (const p of papers) {
        if (p.id && p.id.startsWith('dummy-')) {
          dummyCount++;
        }
      }
    }

    return {
      valid: missingTopics.length === 0 && totalPapers > 0,
      missingTopics,
      topicStats,
      totalPapers,
      dummyCount
    };
  } catch (err) {
    return { valid: false, error: `Failed to parse dailyFeed.json: ${err.message}` };
  }
}

module.exports = {
  EXPECTED_TOPIC_SLUGS,
  validatePaper,
  validateDailyFeed
};
