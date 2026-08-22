'use strict';

/**
 * The six shipping topics, and how each one maps onto the two upstream APIs.
 *
 * `openalexFilter` uses OpenAlex "concepts" (C-prefixed ids). `arxivQuery`
 * uses the arXiv search grammar. Keeping both here means adding a seventh
 * topic is a one-object change, not a hunt through the adapters.
 */
const TOPICS = {
  'ai-mental-health': {
    slug: 'ai-mental-health',
    label: 'AI in Mental Health',
    openalexFilter: 'concepts.id:C119857082',
    arxivQuery: 'cat:cs.AI AND (all:"mental health" OR all:"psychiatry" OR all:"therapy")',
  },
  'autism-diagnosis': {
    slug: 'autism-diagnosis',
    label: 'Autism Diagnosis using AI/ML/DL',
    openalexFilter: 'concepts.id:C119857082',
    arxivQuery: 'cat:cs.AI AND (all:"autism" OR all:"ASD" OR all:"autistic")',
  },
  blockchain: {
    slug: 'blockchain',
    label: 'Blockchain',
    openalexFilter: 'concepts.id:C38652104',
    arxivQuery: 'cat:cs.CR AND (all:"blockchain" OR all:"smart contract" OR all:"distributed ledger")',
  },
  'quantum-communication': {
    slug: 'quantum-communication',
    label: 'Quantum Communication',
    openalexFilter: 'concepts.id:C121332964',
    arxivQuery: 'cat:quant-ph AND (all:"quantum communication" OR all:"QKD" OR all:"quantum network")',
  },
  'surveillance-anomaly-detection': {
    slug: 'surveillance-anomaly-detection',
    label: 'Multi-camera Surveillance & Anomaly Detection',
    openalexFilter: 'concepts.id:C31972630',
    arxivQuery: 'cat:cs.CV AND (all:"surveillance" OR all:"anomaly detection" OR all:"multi-camera")',
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
