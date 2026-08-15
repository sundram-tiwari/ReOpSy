'use strict';

/**
 * The six shipping topics, and how each one maps onto the two upstream APIs.
 *
 * `openalexFilter` uses OpenAlex "concepts" (C-prefixed ids). `arxivQuery`
 * uses the arXiv search grammar. Keeping both here means adding a seventh
 * topic is a one-object change, not a hunt through the adapters.
 */
const TOPICS = {
  ml: {
    slug: 'ml',
    label: 'Machine Learning',
    openalexFilter: 'concepts.id:C119857082',
    arxivQuery: 'cat:cs.LG OR cat:stat.ML',
  },
  dl: {
    slug: 'dl',
    label: 'Deep Learning',
    openalexFilter: 'concepts.id:C119857082',
    arxivQuery: 'cat:cs.LG OR cat:cs.NE',
  },
  nlp: {
    slug: 'nlp',
    label: 'Language & NLP',
    openalexFilter: 'concepts.id:C204321447',
    arxivQuery: 'cat:cs.CL',
  },
  cv: {
    slug: 'cv',
    label: 'Computer Vision',
    openalexFilter: 'concepts.id:C31972630',
    arxivQuery: 'cat:cs.CV',
  },
  'ai-health': {
    slug: 'ai-health',
    label: 'AI in Mental Health',
    openalexFilter: 'concepts.id:C119857082', // ML combined with health/mental keywords via query
    arxivQuery: 'cat:cs.AI AND (all:"mental health" OR all:"psychiatry" OR all:"therapy")',
  },
  llm: {
    slug: 'llm',
    label: 'Large Language Models',
    openalexFilter: 'concepts.id:C204321447',
    arxivQuery: 'cat:cs.CL AND (all:"large language model" OR all:"LLM")',
  },
  robotics: {
    slug: 'robotics',
    label: 'Robotics & Control',
    openalexFilter: 'concepts.id:C28881434',
    arxivQuery: 'cat:cs.RO',
  },
  cybersecurity: {
    slug: 'cybersecurity',
    label: 'Cybersecurity & AI',
    openalexFilter: 'concepts.id:C38652104',
    arxivQuery: 'cat:cs.CR',
  },
  'data-science': {
    slug: 'data-science',
    label: 'Data Science',
    openalexFilter: 'concepts.id:C11413529',
    arxivQuery: 'cat:stat.ML OR cat:stat.AP',
  },
  bio: {
    slug: 'bio',
    label: 'Computational Biology',
    openalexFilter: 'concepts.id:C70721500',
    arxivQuery: 'cat:q-bio.QM OR cat:q-bio.GN OR cat:q-bio.BM',
  },
};

const ALL_SLUGS = Object.keys(TOPICS);

/** Parse a `--topics ml,nlp` argument into validated slugs. */
function resolveTopics(arg) {
  if (!arg || arg === 'all') return [...ALL_SLUGS];
  const wanted = String(arg)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const unknown = wanted.filter((s) => !TOPICS[s]);
  if (unknown.length) {
    throw new Error(
      `Unknown topic(s): ${unknown.join(', ')}. Valid topics: ${ALL_SLUGS.join(', ')}`
    );
  }
  return [...new Set(wanted)];
}

module.exports = { TOPICS, ALL_SLUGS, resolveTopics };
