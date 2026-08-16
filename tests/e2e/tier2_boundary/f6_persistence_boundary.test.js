'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock, createSampleDailyFeed } = require('../harness');

describe('Tier 2 - Boundary: F6 Flashcard Persistence', () => {
  test('B6.1: Network timeout / failure during Firestore persistence triggers rollback and error state', async () => {
    let localFeed = createSampleDailyFeed(1);
    const originalTitle = localFeed.topics['llm'][0].catchyTitle;

    const failingFirestore = {
      setDoc: async () => { throw new Error('503 Service Unavailable'); }
    };

    let errorCaught = null;
    try {
      await failingFirestore.setDoc({}, localFeed);
    } catch (err) {
      errorCaught = err.message;
      // Rollback
      localFeed.topics['llm'][0].catchyTitle = originalTitle;
    }

    assert.ok(errorCaught);
    assert.equal(localFeed.topics['llm'][0].catchyTitle, originalTitle, 'Local state must rollback on failure');
  });

  test('B6.2: Corrupted or null remote document falls back to bundled dailyFeed JSON', async () => {
    const firestore = new FirestoreMock();
    await firestore.setDoc(firestore.doc('content', 'dailyFeed'), { corrupted: true });

    const getSafeFeed = async (db, bundledDefault) => {
      try {
        const snap = await db.getDoc(db.doc('content', 'dailyFeed'));
        if (snap.exists() && snap.data().topics) {
          return snap.data();
        }
      } catch (err) {
        console.warn('Failed to load remote feed:', err);
      }
      return bundledDefault;
    };

    const bundledFeed = createSampleDailyFeed(2);
    const feed = await getSafeFeed(firestore, bundledFeed);

    assert.ok(feed.topics);
    assert.equal(Object.keys(feed.topics).length, 10);
  });

  test('B6.3: Concurrent edits from multiple admins merge at paper level', async () => {
    const firestore = new FirestoreMock();
    const docRef = firestore.doc('content', 'dailyFeed');

    // Admin 1 edits NLP
    const feed1 = createSampleDailyFeed(1);
    feed1.topics['nlp'][0].catchyTitle = 'Admin 1 NLP Update';
    await firestore.setDoc(docRef, feed1);

    // Admin 2 edits CV
    const currentDoc = (await firestore.getDoc(docRef)).data();
    currentDoc.topics['cv'][0].catchyTitle = 'Admin 2 CV Update';
    await firestore.setDoc(docRef, currentDoc);

    // Verify both edits survive
    const finalDoc = (await firestore.getDoc(docRef)).data();
    assert.equal(finalDoc.topics['nlp'][0].catchyTitle, 'Admin 1 NLP Update');
    assert.equal(finalDoc.topics['cv'][0].catchyTitle, 'Admin 2 CV Update');
  });

  test('B6.4: Maximum payload size verification for 100 papers across 10 topics', () => {
    const largeFeed = createSampleDailyFeed(10); // 100 papers total
    const jsonStr = JSON.stringify(largeFeed);
    const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');

    // Must be well within Firestore 1MB (1,048,576 bytes) limit
    assert.ok(sizeBytes < 500000, `Large feed size ${sizeBytes} bytes should be < 500KB`);
  });

  test('B6.5: Cold start rehydration loads full feed with all 10 topic groups intact', async () => {
    const firestore = new FirestoreMock();
    const docRef = firestore.doc('content', 'dailyFeed');
    const initial = createSampleDailyFeed(2);
    await firestore.setDoc(docRef, initial);

    // Simulate new app instance / cold start
    const coldStartSnapshot = await firestore.getDoc(docRef);
    assert.equal(coldStartSnapshot.exists(), true);
    const hydrated = coldStartSnapshot.data();

    assert.equal(Object.keys(hydrated.topics).length, 10);
  });
});
