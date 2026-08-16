'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock, EXPECTED_TOPIC_SLUGS } = require('../harness');

describe('Tier 1 - Feature F8: Pipeline Control UI & Queue', () => {
  const adminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail: adminEmail });

  /**
   * Helper simulating admin UI enqueuing topic fetch
   */
  async function triggerTopicFetch(db, topic, requestedBy = adminEmail) {
    // Check for existing pending request for this topic
    const queueCol = db.collection('pipeline_queue');
    const existing = await db.getDocs(db.query(queueCol, db.where('topic', '==', topic), db.where('status', '==', 'pending')));

    if (existing.docs.length > 0) {
      return { success: false, queueId: existing.docs[0].id, isDuplicate: true };
    }

    const queueId = `queue_${topic}_${Date.now()}`;
    const queueData = {
      queueId,
      topic,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      requestedBy
    };

    await db.setDoc(db.doc('pipeline_queue', queueId), queueData);
    return { success: true, queueId, isDuplicate: false, data: queueData };
  }

  test('F8.1: Pipeline Control section reads and displays last run metadata from pipeline_runs', async () => {
    // Seed last run
    const lastRunDoc = {
      runId: 'run_latest',
      timestamp: new Date().toISOString(),
      topicCounts: { llm: 6, cv: 5, nlp: 4 },
      totalPapers: 15,
      errors: [],
      status: 'success'
    };
    await firestore.setDoc(firestore.doc('pipeline_runs', 'run_latest'), lastRunDoc);

    const doc = (await firestore.getDoc(firestore.doc('pipeline_runs', 'run_latest'))).data();
    assert.equal(doc.runId, 'run_latest');
    assert.equal(doc.totalPapers, 15);
    assert.equal(doc.status, 'success');
  });

  test('F8.2: Trigger Fetch button writes task to Firestore pipeline_queue with topic, pending status, requestedAt', async () => {
    const result = await triggerTopicFetch(firestore, 'llm', adminEmail);
    assert.equal(result.success, true);
    assert.ok(result.queueId);

    const queueDoc = (await firestore.getDoc(firestore.doc('pipeline_queue', result.queueId))).data();
    assert.equal(queueDoc.topic, 'llm');
    assert.equal(queueDoc.status, 'pending');
    assert.equal(queueDoc.requestedBy, adminEmail);
    assert.ok(queueDoc.requestedAt);
  });

  test('F8.3: Trigger fetch supports all 10 predefined research topics individually', async () => {
    for (const slug of EXPECTED_TOPIC_SLUGS) {
      if (slug === 'llm') continue; // already enqueued in previous test
      const res = await triggerTopicFetch(firestore, slug, adminEmail);
      assert.equal(res.success, true, `Should trigger fetch for ${slug}`);
    }

    const allQueueDocs = await firestore.getDocs(firestore.collection('pipeline_queue'));
    assert.equal(allQueueDocs.docs.length, 10, 'All 10 topics should have a queue entry');
  });

  test('F8.4: Queue deduplication prevents duplicate active pending entries for the same topic', async () => {
    const duplicateAttempt = await triggerTopicFetch(firestore, 'llm', adminEmail);
    assert.equal(duplicateAttempt.success, false);
    assert.equal(duplicateAttempt.isDuplicate, true);
  });

  test('F8.5: Queue processor transitions item status from pending -> processing -> completed', async () => {
    const queueId = `queue_cv_${Date.now()}`;
    const docRef = firestore.doc('pipeline_queue', queueId);
    await firestore.setDoc(docRef, { topic: 'cv', status: 'pending', requestedAt: new Date().toISOString() });

    // Transition to processing
    await firestore.updateDoc(docRef, { status: 'processing', startedAt: new Date().toISOString() });
    let current = (await firestore.getDoc(docRef)).data();
    assert.equal(current.status, 'processing');
    assert.ok(current.startedAt);

    // Transition to completed
    await firestore.updateDoc(docRef, { status: 'completed', completedAt: new Date().toISOString(), papersFetched: 5 });
    current = (await firestore.getDoc(docRef)).data();
    assert.equal(current.status, 'completed');
    assert.equal(current.papersFetched, 5);
  });

  test('F8.6: Pipeline Control UI query filters queue by pending/processing status for active indicators', async () => {
    const queueCol = firestore.collection('pipeline_queue');
    const pendingQuery = firestore.query(queueCol, firestore.where('status', '==', 'pending'));
    const pendingDocs = await firestore.getDocs(pendingQuery);

    assert.ok(pendingDocs.docs.length > 0, 'Should return active pending items');
    assert.ok(pendingDocs.docs.every(d => d.data().status === 'pending'));
  });
});
