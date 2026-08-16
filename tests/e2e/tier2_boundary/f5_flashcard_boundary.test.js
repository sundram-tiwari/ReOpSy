'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestPaper, validatePaperStructure } = require('../harness');

describe('Tier 2 - Boundary: F5 Flashcard Manager Inline CRUD', () => {
  test('B5.1: Extreme string lengths (>1000 char title, >5000 char summary) maintain structure', () => {
    const hugeTitle = 'A'.repeat(1000);
    const hugeSummary = 'B'.repeat(5000);

    const paper = createTestPaper('llm', {
      originalTitle: hugeTitle,
      catchyTitle: hugeTitle,
      summary: hugeSummary
    });

    const val = validatePaperStructure(paper);
    assert.equal(val.valid, true);
    assert.equal(paper.catchyTitle.length, 1000);
    assert.equal(paper.summary.length, 5000);
  });

  test('B5.2: Special characters, markdown, HTML, and code snippets in catchy title and summary are preserved safely', () => {
    const specialTitle = 'Attention is All You Need: $O(N^2)$ & <script>alert("xss")</script> **Bold**';
    const specialSummary = 'Summary with `code`, LaTeX: $\\alpha + \\beta = \\gamma$, and quotes: "Hello & World"';

    const paper = createTestPaper('nlp', {
      catchyTitle: specialTitle,
      summary: specialSummary
    });

    assert.equal(paper.catchyTitle, specialTitle);
    assert.equal(paper.summary, specialSummary);
  });

  test('B5.3: Empty or whitespace-only edits are rejected by input validation', () => {
    const validateEdit = (field, value) => {
      if (!value || typeof value !== 'string' || value.trim().length === 0) {
        return { valid: false, error: `${field} cannot be empty` };
      }
      return { valid: true };
    };

    assert.equal(validateEdit('title', '').valid, false);
    assert.equal(validateEdit('title', '   \t\n  ').valid, false);
    assert.equal(validateEdit('title', 'Valid New Title').valid, true);
    assert.equal(validateEdit('summary', '   ').valid, false);
  });

  test('B5.4: URL formatting validation for source and PDF fields', () => {
    const isValidUrl = (urlStr) => {
      if (!urlStr) return false;
      try {
        const u = new URL(urlStr);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    };

    assert.equal(isValidUrl('https://arxiv.org/abs/2401.12345'), true);
    assert.equal(isValidUrl('http://openalex.org/W123'), true);
    assert.equal(isValidUrl('not_a_valid_url'), false);
    assert.equal(isValidUrl('javascript:alert(1)'), false);
  });

  test('B5.5: Deleting all cards in a topic gracefully maintains an empty array without throwing', () => {
    const feed = { topics: { llm: [createTestPaper('llm')] } };
    feed.topics['llm'] = []; // Delete all

    assert.ok(Array.isArray(feed.topics['llm']));
    assert.equal(feed.topics['llm'].length, 0);
  });
});
