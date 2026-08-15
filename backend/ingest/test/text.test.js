'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  stripLatex, stripHtml, normalizeWhitespace, truncateWords,
  splitSentences, titleKey, wordCount, tokenize,
} = require('../lib/text');

test('normalizeWhitespace collapses newlines and runs', () => {
  assert.equal(normalizeWhitespace('  a\n\n  b\t c  '), 'a b c');
  assert.equal(normalizeWhitespace(null), '');
});

test('stripLatex removes inline and display math but keeps prose spacing', () => {
  const out = stripLatex('We train on $n$ tokens and reach $$\\frac{a}{b}$$ accuracy.');
  assert.ok(!out.includes('$'), `math survived: ${out}`);
  assert.ok(out.includes('We train on'), out);
  assert.ok(out.includes('accuracy'), out);
  assert.ok(!/\s{2,}/.test(out), `double spaces left: "${out}"`);
});

test('stripLatex keeps the argument of prose commands, drops the rest', () => {
  assert.equal(stripLatex('This is \\emph{important} work.'), 'This is important work.');
  assert.equal(stripLatex('A \\newline B'), 'A B');
});

test('stripLatex handles accents and escaped dollars', () => {
  assert.equal(stripLatex("Erd\\H{o}s and Schr\\\"{o}dinger"), 'Erdos and Schrodinger');
  assert.ok(stripLatex('costs \\$5 per run').includes('$5'));
});

test('stripLatex removes environments wholesale', () => {
  const out = stripLatex('Before \\begin{equation} x = y \\end{equation} after.');
  assert.equal(out, 'Before after.');
});

test('stripHtml unescapes entities and drops tags', () => {
  assert.equal(stripHtml('<p>a &amp; b</p>'), 'a & b');
});

test('splitSentences does not break on common abbreviations', () => {
  const s = splitSentences('We follow Smith et al. and report results. Then we stop.');
  assert.equal(s.length, 2, JSON.stringify(s));
  assert.ok(s[0].includes('et al.'));
});

test('splitSentences returns empty for empty input', () => {
  assert.deepEqual(splitSentences(''), []);
});

test('truncateWords respects the budget and marks the cut', () => {
  const out = truncateWords('one two three four five', 3);
  assert.equal(out, 'one two three…');
  assert.equal(truncateWords('one two', 5), 'one two');
});

test('titleKey collapses punctuation and case', () => {
  assert.equal(titleKey('Attention Is All You Need'), titleKey('attention is all you need!'));
  assert.notEqual(titleKey('A study of X'), titleKey('A study of Y'));
});

test('tokenize drops stopwords and short tokens', () => {
  assert.deepEqual(tokenize('The model is a transformer'), ['model', 'transformer']);
});

test('wordCount counts words, not characters', () => {
  assert.equal(wordCount('  a b   c '), 3);
  assert.equal(wordCount(''), 0);
});
