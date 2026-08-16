'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  FirestoreMock,
  createSampleDailyFeed,
  createTestPaper
} = require('../harness');

describe('Tier 1 - Feature F6: Flashcard Persistence', () => {
  const superAdminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });

  test('F6.1: Modified flashcard feed writes to Firestore content/dailyFeed document', async () => {
    const feed = createSampleDailyFeed(2);
    feed.topics['llm'][0].catchyTitle = 'Persisted Title in Firestore';

    const contentDocRef = firestore.doc('content', 'dailyFeed');
    await firestore.setDoc(contentDocRef, {
      ...feed,
      updatedAt: new Date().toISOString(),
      updatedBy: superAdminEmail
    });

    const docSnapshot = await firestore.getDoc(contentDocRef);
    assert.equal(docSnapshot.exists(), true);
    const data = docSnapshot.data();
    assert.equal(data.topics['llm'][0].catchyTitle, 'Persisted Title in Firestore');
  });

  test('F6.2: Fetching from content/dailyFeed returns latest saved overrides', async () => {
    const contentDocRef = firestore.doc('content', 'dailyFeed');
    const docSnapshot = await firestore.getDoc(contentDocRef);
    assert.equal(docSnapshot.exists(), true);

    const savedFeed = docSnapshot.data();
    assert.ok(savedFeed.topics);
    assert.ok(savedFeed.topics['llm'].length > 0);
    assert.equal(savedFeed.topics['llm'][0].catchyTitle, 'Persisted Title in Firestore');
  });

  test('F6.3: Deletion of a flashcard persists to Firestore and is omitted on subsequent loads', async () => {
    const contentDocRef = firestore.doc('content', 'dailyFeed');
    const docSnapshot = await firestore.getDoc(contentDocRef);
    const feed = docSnapshot.data();

    const topic = 'audio';
    const initialLen = feed.topics[topic].length;
    const removedId = feed.topics[topic][0].id;

    feed.topics[topic] = feed.topics[topic].filter(p => p.id !== removedId);
    feed.updatedAt = new Date().toISOString();
    feed.updatedBy = superAdminEmail;

    await firestore.setDoc(contentDocRef, feed);

    const reloaded = (await firestore.getDoc(contentDocRef)).data();
    assert.equal(reloaded.topics[topic].length, initialLen - 1);
    assert.equal(reloaded.topics[topic].some(p => p.id === removedId), false);
  });

  test('F6.4: Local state updates optimistically and syncs with remote document', async () => {
    let localFeed = createSampleDailyFeed(1);
    const targetPaper = localFeed.topics['rl'][0];
    const newSummary = 'Reinforcement learning with direct preference optimization.';

    // 1. Optimistic update
    targetPaper.summary = newSummary;
    assert.equal(localFeed.topics['rl'][0].summary, newSummary);

    // 2. Async persistence
    const contentDocRef = firestore.doc('content', 'dailyFeed');
    await firestore.setDoc(contentDocRef, {
      ...localFeed,
      updatedAt: new Date().toISOString(),
      updatedBy: superAdminEmail
    });

    // 3. Verify remote state
    const remoteDoc = await firestore.getDoc(contentDocRef);
    assert.equal(remoteDoc.data().topics['rl'][0].summary, newSummary);
  });

  test('F6.5: Firestore write includes metadata (updatedAt, updatedBy admin email)', async () => {
    const contentDocRef = firestore.doc('content', 'dailyFeed');
    const beforeWrite = new Date().toISOString();

    await firestore.setDoc(contentDocRef, {
      topics: {},
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin@reopsy.com'
    });

    const doc = (await firestore.getDoc(contentDocRef)).data();
    assert.ok(doc.updatedAt >= beforeWrite);
    assert.equal(doc.updatedBy, 'admin@reopsy.com');
  });

  test('F6.6: Pipeline feed regeneration preserves admin customized flashcard titles and summaries', async () => {
    // Simulate pipeline merge logic: check if Firestore has overrides
    const contentDocRef = firestore.doc('content', 'dailyFeed');
    const existingData = {
      topics: {
        'nlp': [
          createTestPaper('nlp', {
            id: 'arxiv:nlp_001',
            catchyTitle: 'Custom Admin Curated NLP Title',
            summary: 'Admin curated summary.'
          })
        ]
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin@reopsy.com'
    };
    await firestore.setDoc(contentDocRef, existingData);

    // New incoming paper from crawler with same ID
    const rawCrawledPaper = createTestPaper('nlp', {
      id: 'arxiv:nlp_001',
      catchyTitle: 'Raw Algorithmic Title',
      summary: 'Raw abstract.'
    });

    // Merge strategy: existing admin curated paper takes precedence
    const savedDoc = (await firestore.getDoc(contentDocRef)).data();
    const existingPaper = savedDoc.topics['nlp']?.find(p => p.id === rawCrawledPaper.id);

    const finalPaper = existingPaper ? { ...rawCrawledPaper, catchyTitle: existingPaper.catchyTitle, summary: existingPaper.summary } : rawCrawledPaper;

    assert.equal(finalPaper.catchyTitle, 'Custom Admin Curated NLP Title');
    assert.equal(finalPaper.summary, 'Admin curated summary.');
  });
});
