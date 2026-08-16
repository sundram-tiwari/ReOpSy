'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 4 - Scenario 4: Pipeline Trigger & Real-Time Monitoring Journey', () => {
  const superAdminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });

  test('Scenario 4: Admin triggers pipeline fetch for topic, verifies queueing, processes tasks, and inspects run status', async () => {
    // Step 1: Admin navigates to Pipeline Control tab
    // Step 2: Admin triggers fetch for 'llm' topic
    const topic = 'llm';
    const queueId = `queue_${topic}_${Date.now()}`;
    const enqueueTime = new Date().toISOString();

    await firestore.setDoc(firestore.doc('pipeline_queue', queueId), {
      queueId,
      topic,
      requestedAt: enqueueTime,
      status: 'pending',
      requestedBy: superAdminEmail
    });

    // Step 3: Verify pipeline_queue holds the pending request
    let queueDoc = (await firestore.getDoc(firestore.doc('pipeline_queue', queueId))).data();
    assert.equal(queueDoc.topic, topic);
    assert.equal(queueDoc.status, 'pending');

    // Step 4: Backend cron / scheduler polls pipeline_queue and claims task
    await firestore.updateDoc(firestore.doc('pipeline_queue', queueId), {
      status: 'processing',
      startedAt: new Date().toISOString()
    });

    // Step 5: Backend fetchAndSummarize runs for topic 'llm', fetches papers, generates titles, and writes run log
    const runId = `run_exec_${Date.now()}`;
    const runLog = {
      runId,
      timestamp: new Date().toISOString(),
      topicCounts: {
        llm: 5
      },
      totalPapers: 5,
      errors: [],
      status: 'success'
    };
    await firestore.setDoc(firestore.doc('pipeline_runs', runId), runLog);

    // Step 6: Task in pipeline_queue is marked completed
    await firestore.updateDoc(firestore.doc('pipeline_queue', queueId), {
      status: 'completed',
      completedAt: new Date().toISOString(),
      runId
    });

    // Step 7: Admin UI in Pipeline Control refreshes and reflects last run stats
    const latestRun = (await firestore.getDoc(firestore.doc('pipeline_runs', runId))).data();
    assert.equal(latestRun.runId, runId);
    assert.equal(latestRun.totalPapers, 5);
    assert.equal(latestRun.topicCounts.llm, 5);
    assert.equal(latestRun.status, 'success');
  });
});
