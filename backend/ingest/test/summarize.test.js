'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { summarize, summarizeFromMetadata, MAX_WORDS } = require('../lib/summarize');
const { wordCount, splitSentences } = require('../lib/text');

const ABSTRACT = [
  'Recurrent models factor computation along symbol positions of the input and output sequences.',
  'This inherently sequential nature precludes parallelisation within training examples.',
  'We propose the Transformer, a network architecture based solely on attention mechanisms.',
  'Experiments on two machine translation tasks show these models to be superior in quality.',
  'Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task.',
  'We show that the Transformer generalises well to other tasks with limited training data.',
].join(' ');

test('summary never exceeds the 30-word budget', () => {
  const s = summarize(ABSTRACT, 'Attention Is All You Need');
  assert.ok(wordCount(s) <= MAX_WORDS, `${wordCount(s)} words: ${s}`);
  assert.ok(s.length > 0);
});

test('every summary sentence appears in the source (extractive, never invented)', () => {
  const s = summarize(ABSTRACT, 'Attention Is All You Need').replace(/…$/, '');
  for (const sentence of splitSentences(s)) {
    const stem = sentence.replace(/[….]+$/, '').slice(0, 40);
    assert.ok(ABSTRACT.includes(stem), `invented text: "${sentence}"`);
  }
});

test('short abstracts are returned unchanged', () => {
  const short = 'We prove a tight bound for the problem.';
  assert.equal(summarize(short, 'Bounds'), short);
});

test('sentences are emitted in source order, not score order', () => {
  const s = summarize(ABSTRACT, 'Attention Is All You Need');
  const sentences = splitSentences(ABSTRACT);
  const positions = splitSentences(s)
    .map((x) => sentences.findIndex((src) => src.startsWith(x.slice(0, 30))))
    .filter((i) => i >= 0);
  const sorted = [...positions].sort((a, b) => a - b);
  assert.deepEqual(positions, sorted, `out of order: ${positions}`);
});

test('title terms pull relevant sentences into the summary', () => {
  const s = summarize(ABSTRACT, 'Transformer architecture for translation');
  assert.ok(/Transformer|translation/i.test(s), s);
});

test('empty and whitespace input yields an empty summary, not a crash', () => {
  assert.equal(summarize(''), '');
  assert.equal(summarize('   '), '');
  assert.equal(summarize(null), '');
});

test('a single very long sentence is clipped rather than dropped', () => {
  const long = 'We ' + 'consider the general case of '.repeat(20) + 'this problem.';
  const s = summarize(long, 'General case');
  assert.ok(wordCount(s) <= MAX_WORDS, `${wordCount(s)} words`);
  assert.ok(s.startsWith('We consider'), s);
});

test('metadata fallback produces a usable card when there is no abstract', () => {
  const s = summarizeFromMetadata({
    title: 'On the Origin of Species',
    authors: ['Charles Darwin'],
    year: 1859,
    venue: 'John Murray',
  });
  assert.ok(wordCount(s) <= MAX_WORDS);
  assert.ok(s.includes('Origin of Species'));
  assert.ok(/no abstract/i.test(s));
});
