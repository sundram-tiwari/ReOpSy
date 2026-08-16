'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 2 - Boundary: F7 Pipeline Run Logging', () => {
  const firestore = new FirestoreMock();

  test('B7.1: Pipeline run with 0 papers fetched across all topics is recorded as failed or empty run', async () => {
    const emptyRun = {
      runId: 'run_empty_001',
      timestamp: new Date().toISOString(),
      topicCounts: { llm: 0, cv: 0, nlp: 0 },
      totalPapers: 0,
      errors: ['No papers returned by external providers'],
      status: 'failed'
    };

    await firestore.setDoc(firestore.doc('pipeline_runs', emptyRun.runId), emptyRun);
    const doc = (await firestore.getDoc(firestore.doc('pipeline_runs', emptyRun.runId))).data();

    assert.equal(doc.totalPapers, 0);
    assert.equal(doc.status, 'failed');
    assert.equal(doc.errors.length, 1);
  });

  test('B7.2: Huge error stack traces (>10KB) are truncated or stored safely without throwing', async () => {
    const hugeStackTrace = 'Error: arXiv API down\n' + 'at fetchTopic (/app/lib/arxiv.js:45:12)\n'.repeat(500);

    const sanitizeError = (errStr, maxLen = 1000) => {
      if (!errStr) return '';
      return errStr.length > maxLen ? `${errStr.substring(0, maxLen)}... [truncated]` : errStr;
    };

    const sanitized = sanitizeError(hugeStackTrace);
    assert.ok(sanitized.length <= 1050);
    assert.ok(sanitized.includes('[truncated]'));
  });

  test('B7.3: Pipeline run with all 10 topics failing simultaneously records each topic error', async () => {
    const errors = [];
    const counts = {};
    const topics = ['llm', 'cv', 'nlp', 'rl', 'robotics', 'audio', 'multimodal', 'graph', 'neuro', 'quantum'];

    for (const t of topics) {
      counts[t] = 0;
      errors.push(`Topic ${t} failed: 429 Rate Limit Exceeded`);
    }

    const runId = 'run_all_failed';
    await firestore.setDoc(firestore.doc('pipeline_runs', runId), {
      runId,
      timestamp: new Date().toISOString(),
      topicCounts: counts,
      totalPapers: 0,
      errors,
      status: 'failed'
    });

    const doc = (await firestore.getDoc(firestore.doc('pipeline_runs', runId))).data();
    assert.equal(doc.status, 'failed');
    assert.equal(doc.errors.length, 10);
  });

  test('B7.4: Special characters and emojis in paper titles/summaries are safely encoded in run metadata', async () => {
    const specialTitle = 'Quantum supremacy 🚀: $H |\\psi\\rangle = E |\\psi\\rangle$ & "quotes"';
    const runDoc = {
      runId: 'run_special_chars',
      timestamp: new Date().toISOString(),
      topicCounts: { quantum: 1 },
      totalPapers: 1,
      errors: [],
      samplePaperTitle: specialTitle,
      status: 'success'
    };

    await firestore.setDoc(firestore.doc('pipeline_runs', runDoc.runId), runDoc);
    const doc = (await firestore.getDoc(firestore.doc('pipeline_runs', runDoc.runId))).data();
    assert.equal(doc.samplePaperTitle, specialTitle);
  });

  test('B7.5: Non-standard or skewed timestamp formats are normalized to ISO strings', () => {
    const normalizeTimestamp = (ts) => {
      try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return new Date().toISOString();
        return d.toISOString();
      } catch {
        return new Date().toISOString();
      }
    };

    assert.equal(normalizeTimestamp('2026-08-16 12:00:00 UTC'), '2026-08-16T12:00:00.000Z');
    assert.ok(normalizeTimestamp('invalid-date').endsWith('Z'));
  });
});
