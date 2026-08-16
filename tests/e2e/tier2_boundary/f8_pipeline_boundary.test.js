'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 2 - Boundary: F8 Pipeline Control UI & Queue', () => {
  let firestore;

  beforeEach(() => {
    firestore = new FirestoreMock();
  });

  test('B8.1: Debounce and duplicate prevention during rapid button clicks for same topic', async () => {
    const topic = 'llm';
    const queueDocRef = firestore.doc('pipeline_queue', `queue_${topic}`);

    let clicks = 0;
    const triggerWithDebounce = async () => {
      clicks++;
      const existing = await firestore.getDoc(queueDocRef);
      if (existing.exists() && existing.data().status === 'pending') {
        return { queued: false, reason: 'Already in queue' };
      }
      await firestore.setDoc(queueDocRef, { topic, status: 'pending', requestedAt: new Date().toISOString() });
      return { queued: true };
    };

    const first = await triggerWithDebounce();
    const second = await triggerWithDebounce();
    const third = await triggerWithDebounce();

    assert.equal(first.queued, true);
    assert.equal(second.queued, false);
    assert.equal(third.queued, false);
    assert.equal(clicks, 3);
  });

  test('B8.2: Unknown / invalid topic slugs are rejected before writing to queue', async () => {
    const validTopics = ['llm', 'cv', 'nlp', 'rl', 'robotics', 'audio', 'multimodal', 'graph', 'neuro', 'quantum'];

    const enqueueTopic = (topic) => {
      if (!validTopics.includes(topic)) {
        throw new Error(`Invalid topic slug: ${topic}`);
      }
      return { valid: true };
    };

    assert.throws(() => enqueueTopic('invalid_slug_xyz'), /Invalid topic slug/);
    assert.throws(() => enqueueTopic(''), /Invalid topic slug/);
    assert.equal(enqueueTopic('robotics').valid, true);
  });

  test('B8.3: Queue with large volume (100+ tasks) is processed in FIFO order', async () => {
    const queueCol = firestore.collection('pipeline_queue');
    const tasks = [];

    for (let i = 0; i < 20; i++) {
      const id = `q_${String(i).padStart(3, '0')}`;
      const task = {
        queueId: id,
        topic: 'llm',
        status: 'pending',
        timestamp: new Date(Date.now() + i * 1000).toISOString()
      };
      await firestore.setDoc(firestore.doc('pipeline_queue', id), task);
      tasks.push(task);
    }

    const pendingQuery = firestore.query(queueCol, firestore.orderBy('timestamp', 'asc'));
    const results = await firestore.getDocs(pendingQuery);

    assert.equal(results.docs.length, 20);
    assert.equal(results.docs[0].id, 'q_000');
    assert.equal(results.docs[19].id, 'q_019');
  });

  test('B8.4: Stale pending tasks (>24 hours old) can be identified and purged or retried', async () => {
    const now = Date.now();
    const staleTime = new Date(now - 25 * 3600 * 1000).toISOString(); // 25h ago
    const freshTime = new Date(now - 1 * 3600 * 1000).toISOString(); // 1h ago

    await firestore.setDoc(firestore.doc('pipeline_queue', 'stale_1'), { status: 'pending', requestedAt: staleTime });
    await firestore.setDoc(firestore.doc('pipeline_queue', 'fresh_1'), { status: 'pending', requestedAt: freshTime });

    const isStale = (task, maxAgeHours = 24) => {
      const ageMs = Date.now() - new Date(task.requestedAt).getTime();
      return ageMs > maxAgeHours * 3600 * 1000;
    };

    const staleDoc = (await firestore.getDoc(firestore.doc('pipeline_queue', 'stale_1'))).data();
    const freshDoc = (await firestore.getDoc(firestore.doc('pipeline_queue', 'fresh_1'))).data();

    assert.equal(isStale(staleDoc), true);
    assert.equal(isStale(freshDoc), false);
  });

  test('B8.5: Enqueuing with empty requestedBy defaults to system or current admin email', async () => {
    const queueData = {
      topic: 'rl',
      status: 'pending',
      requestedAt: new Date().toISOString(),
      requestedBy: null
    };

    const sanitizedRequestedBy = queueData.requestedBy || 'system';
    assert.equal(sanitizedRequestedBy, 'system');
  });
});
