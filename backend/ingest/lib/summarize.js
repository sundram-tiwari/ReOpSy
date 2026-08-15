'use strict';

const {
  normalizeWhitespace,
  splitSentences,
  tokenize,
  wordCount,
  truncateWords,
  sentenceCase,
} = require('./text');

const MAX_WORDS = 60;

/**
 * Extractive summariser, ~60 words, no model and no network.
 *
 * Why extractive: an abstractive model would invent claims, and inventing
 * claims about someone else's paper is the one failure mode this app cannot
 * afford. Every word shown to the user appears in the source abstract.
 *
 * Scoring is deliberately simple and explainable:
 *   - term frequency of content words, normalised by sentence length
 *   - a bonus for overlap with the title (the title states the contribution)
 *   - a positional bonus for the first two sentences (abstracts front-load)
 *   - a bonus for sentences containing a claim cue ("we propose", "results")
 *
 * Selected sentences are re-emitted in their original order so the summary
 * still reads as prose rather than as a bag of highlights.
 */
function summarize(abstract, title = '', maxWords = MAX_WORDS) {
  const text = normalizeWhitespace(abstract);
  if (!text) return '';

  const sentences = splitSentences(text);
  if (sentences.length === 0) return '';
  if (wordCount(text) <= maxWords) return text;
  if (sentences.length === 1) return truncateWords(sentences[0], maxWords);

  // Corpus term frequencies across the abstract.
  const freq = new Map();
  for (const s of sentences) {
    for (const w of tokenize(s)) freq.set(w, (freq.get(w) || 0) + 1);
  }
  let maxFreq = 0;
  for (const v of freq.values()) if (v > maxFreq) maxFreq = v;
  if (maxFreq === 0) maxFreq = 1;

  const titleTerms = new Set(tokenize(title));

  const CLAIM_CUE = /\b(we (propose|present|introduce|show|find|develop|demonstrate)|this (paper|work|study)|our (approach|method|model|results|analysis)|results? (show|suggest|indicate)|achiev\w*|outperform\w*|state[- ]of[- ]the[- ]art)\b/i;

  const scored = sentences.map((sentence, index) => {
    const terms = tokenize(sentence);
    if (terms.length === 0) return { sentence, index, score: 0, words: wordCount(sentence) };

    let tf = 0;
    let titleHits = 0;
    for (const w of terms) {
      tf += (freq.get(w) || 0) / maxFreq;
      if (titleTerms.has(w)) titleHits += 1;
    }

    let score = tf / Math.sqrt(terms.length);          // length-normalised density
    score += (titleHits / terms.length) * 1.5;          // says what the title says
    if (index === 0) score += 0.6;                      // abstracts front-load
    else if (index === 1) score += 0.25;
    if (CLAIM_CUE.test(sentence)) score += 0.4;         // states a contribution
    if (terms.length < 4) score -= 0.5;                 // fragments are noise

    return { sentence, index, score, words: wordCount(sentence) };
  });

  const byScore = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen = [];
  let budget = maxWords;
  for (const cand of byScore) {
    if (cand.words <= budget) {
      chosen.push(cand);
      budget -= cand.words;
    }
    if (budget <= 8) break;   // no room for another useful sentence
  }

  // Nothing fit (one very long opening sentence): take the best one, clipped.
  if (chosen.length === 0) return truncateWords(byScore[0].sentence, maxWords);

  chosen.sort((a, b) => a.index - b.index);
  const out = chosen.map((c) => c.sentence).join(' ');
  return truncateWords(sentenceCase(out), maxWords);
}

/**
 * Fallback for records with no abstract at all: build a one-line descriptor
 * out of the metadata we do have. Never returns an empty string, because a
 * card with no text at all looks like a bug to the user.
 */
function summarizeFromMetadata({ title, authors = [], year, venue }) {
  const bits = [];
  if (title) bits.push(normalizeWhitespace(title).replace(/\.$/, '') + '.');
  if (authors.length) {
    bits.push(authors.length > 2 ? `${authors[0]} et al.` : authors.join(' and ') + '.');
  }
  if (venue && year) bits.push(`${venue}, ${year}.`);
  else if (venue) bits.push(`${venue}.`);
  else if (year) bits.push(`${year}.`);
  bits.push('No abstract was published for this record — open the paper to read it in full.');
  return truncateWords(bits.join(' '), MAX_WORDS);
}

module.exports = { summarize, summarizeFromMetadata, MAX_WORDS };
