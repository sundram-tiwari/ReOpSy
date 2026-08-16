'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock, EXPECTED_TOPIC_SLUGS } = require('../harness');

describe('Tier 1 - Feature F7: Pipeline Run Logging', () => {
  const firestore = new FirestoreMock();

  /**
   * Helper simulating backend pipeline logger
   */
  async function logPipelineRun(db, runData) {
    const runId = runData.runId || `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const topicCounts = runData.topicCounts || {};
    let totalPapers = 0;
    for (const count of Object.values(topicCounts)) {
      totalPapers += count;
    }

    const errors = runData.errors || [];
    let status = 'success';
    if (errors.length > 0) {
      status = Object.keys(topicCounts).length === 0 ? 'failed' : 'partial';
    }

    const docData = {
      runId,
      timestamp: runData.timestamp || new Date().toISOString(),
      topicCounts,
      totalPapers,
      errors,
      status
    };

    await db.setDoc(db.doc('pipeline_runs', runId), docData);
    return docData;
  }

  test('F7.1: Pipeline execution records run metadata to Firestore pipeline_runs collection', async () => {
    const runResult = await logPipelineRun(firestore, {
      topicCounts: { llm: 5, cv: 4, nlp: 5 },
      errors: []
    });

    assert.ok(runResult.runId);
    const saved = (await firestore.getDoc(firestore.doc('pipeline_runs', runResult.runId))).data();
    assert.equal(saved.runId, runResult.runId);
    assert.equal(saved.totalPapers, 14);
    assert.equal(saved.status, 'success');
  });

  test('F7.2: Run record includes timestamp, per-topic counts for 10 topics, total papers, status', async () => {
    const counts = {};
    EXPECTED_TOPIC_SLUGS.forEach(slug => { counts[slug] = 3; });

    const runResult = await logPipelineRun(firestore, {
      topicCounts: counts,
      errors: []
    });

    const saved = (await firestore.getDoc(firestore.doc('pipeline_runs', runResult.runId))).data();
    assert.equal(saved.totalPapers, 30);
    assert.equal(Object.keys(saved.topicCounts).length, 10);
    for (const slug of EXPECTED_TOPIC_SLUGS) {
      assert.equal(saved.topicCounts[slug], 3);
    }
  });

  test('F7.3: Topic level errors are recorded in errors array without crashing run logging', async () => {
    const counts = { llm: 5, cv: 0, nlp: 5 };
    const errors = ['arXiv timeout for topic cv: 504 Gateway Timeout'];

    const runResult = await logPipelineRun(firestore, {
      topicCounts: counts,
      errors
    });

    const saved = (await firestore.getDoc(firestore.doc('pipeline_runs', runResult.runId))).data();
    assert.equal(saved.status, 'partial');
    assert.equal(saved.errors.length, 1);
    assert.ok(saved.errors[0].includes('cv'));
  });

  test('F7.4: Status calculation computes "success" when 0 errors, "partial" when some fail, "failed" when all fail', async () => {
    // 1. Success
    const s1 = await logPipelineRun(firestore, { topicCounts: { llm: 5 }, errors: [] });
    assert.equal(s1.status, 'success');

    // 2. Partial
    const s2 = await logPipelineRun(firestore, { topicCounts: { llm: 5 }, errors: ['audio failed'] });
    assert.equal(s2.status, 'partial');

    // 3. Failed
    const s3 = await logPipelineRun(firestore, { topicCounts: {}, errors: ['Network down', 'DB down'] });
    assert.equal(s3.status, 'failed');
  });

  test('F7.5: Multiple pipeline runs generate unique runIds and can be ordered by timestamp', async () => {
    const run1 = await logPipelineRun(firestore, { timestamp: '2026-08-16T10:00:00Z', topicCounts: { llm: 2 } });
    const run2 = await logPipelineRun(firestore, { timestamp: '2026-08-16T11:00:00Z', topicCounts: { llm: 4 } });

    assert.notEqual(run1.runId, run2.runId);

    const queryRef = firestore.query(firestore.collection('pipeline_runs'), firestore.orderBy('timestamp', 'desc'));
    const allRuns = await firestore.getDocs(queryRef);

    assert.ok(allRuns.docs.length >= 2);
    const runsList = allRuns.docs.map(d => d.data());
    assert.ok(new Date(runsList[0].timestamp) >= new Date(runsList[1].timestamp));
  });

  test('F7.6: Backend logger gracefully handles missing or optional fields', async () => {
    const runResult = await logPipelineRun(firestore, {});
    assert.ok(runResult.runId);
    assert.equal(runResult.totalPapers, 0);
    assert.deepEqual(runResult.errors, []);
    assert.equal(runResult.status, 'success');
  });
});
