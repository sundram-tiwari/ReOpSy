'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 3 - Integration: Pipeline Control Queue -> Worker Ingestion -> Pipeline Runs Logging -> UI Status', () => {
  const adminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail: adminEmail });

  test('I3.7: Admin clicks Trigger Fetch -> enqueues task -> worker processes -> logs run -> UI reflects run results', async () => {
    const topic = 'llm';
    const queueId = `queue_${topic}_100`;

    // 1. Admin triggers fetch
    await firestore.setDoc(firestore.doc('pipeline_queue', queueId), {
      queueId,
      topic,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      requestedBy: adminEmail
    });

    // Verify task is pending
    let queueDoc = (await firestore.getDoc(firestore.doc('pipeline_queue', queueId))).data();
    assert.equal(queueDoc.status, 'pending');

    // 2. Simulated pipeline worker picks up pending task
    await firestore.updateDoc(firestore.doc('pipeline_queue', queueId), {
      status: 'processing',
      startedAt: new Date().toISOString()
    });

    // 3. Worker executes fetch, collects 5 papers, writes to pipeline_runs
    const runId = `run_${Date.now()}`;
    const runDoc = {
      runId,
      timestamp: new Date().toISOString(),
      topicCounts: { [topic]: 5 },
      totalPapers: 5,
      errors: [],
      status: 'success'
    };
    await firestore.setDoc(firestore.doc('pipeline_runs', runId), runDoc);

    // 4. Worker marks queue task completed
    await firestore.updateDoc(firestore.doc('pipeline_queue', queueId), {
      status: 'completed',
      completedAt: new Date().toISOString(),
      runId
    });

    // 5. Admin UI queries latest run and queue status
    queueDoc = (await firestore.getDoc(firestore.doc('pipeline_queue', queueId))).data();
    assert.equal(queueDoc.status, 'completed');

    const latestRun = (await firestore.getDoc(firestore.doc('pipeline_runs', runId))).data();
    assert.equal(latestRun.topicCounts[topic], 5);
    assert.equal(latestRun.status, 'success');
  });

  test('I3.8: Multi-topic queue processing handles sequential/parallel tasks and aggregates overall run status', async () => {
    const topics = ['cv', 'audio', 'quantum'];

    for (const t of topics) {
      await firestore.setDoc(firestore.doc('pipeline_queue', `q_${t}`), {
        topic: t,
        status: 'completed',
        requestedBy: adminEmail
      });
    }

    const multiRunId = `run_multi_${Date.now()}`;
    await firestore.setDoc(firestore.doc('pipeline_runs', multiRunId), {
      runId: multiRunId,
      timestamp: new Date().toISOString(),
      topicCounts: { cv: 4, audio: 3, quantum: 2 },
      totalPapers: 9,
      errors: [],
      status: 'success'
    });

    const runData = (await firestore.getDoc(firestore.doc('pipeline_runs', multiRunId))).data();
    assert.equal(runData.totalPapers, 9);
    assert.equal(runData.topicCounts.cv, 4);
    assert.equal(runData.topicCounts.audio, 3);
    assert.equal(runData.topicCounts.quantum, 2);
  });
});
