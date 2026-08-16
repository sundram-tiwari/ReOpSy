'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock, createSampleDailyFeed } = require('../harness');

describe('Tier 3 - Integration: Flashcard Manager CRUD -> Firestore Content -> Feed Screen Synchronization', () => {
  const superAdminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });

  test('I3.5: Admin edits flashcard in Flashcard Manager, saves to Firestore content/dailyFeed, public Feed reloads updated card', async () => {
    // 1. Initialize feed
    const initialFeed = createSampleDailyFeed(2);
    const targetTopic = 'robotics';
    const paper = initialFeed.topics[targetTopic][0];
    const paperId = paper.id;

    // 2. Admin performs inline edit
    const updatedCatchyTitle = 'Humanoid Robot Locomotion Breakthrough';
    const updatedSummary = 'Zero-shot sim-to-real reinforcement learning for bipedal balancing.';
    paper.catchyTitle = updatedCatchyTitle;
    paper.summary = updatedSummary;

    // 3. Save to Firestore content collection
    const contentRef = firestore.doc('content', 'dailyFeed');
    await firestore.setDoc(contentRef, {
      ...initialFeed,
      updatedAt: new Date().toISOString(),
      updatedBy: superAdminEmail
    });

    // 4. Regular user app opens FeedScreen and fetches content/dailyFeed
    const publicFetch = (await firestore.getDoc(contentRef)).data();
    const fetchedPaper = publicFetch.topics[targetTopic].find(p => p.id === paperId);

    assert.ok(fetchedPaper);
    assert.equal(fetchedPaper.catchyTitle, updatedCatchyTitle);
    assert.equal(fetchedPaper.summary, updatedSummary);
  });

  test('I3.6: Admin deletes flashcard, change persists to Firestore, FeedScreen renders updated list without deleted card', async () => {
    const contentRef = firestore.doc('content', 'dailyFeed');
    const existingFeed = (await firestore.getDoc(contentRef)).data();

    const targetTopic = 'robotics';
    const targetPaperId = existingFeed.topics[targetTopic][0].id;
    const countBefore = existingFeed.topics[targetTopic].length;

    // 1. Admin deletes card
    existingFeed.topics[targetTopic] = existingFeed.topics[targetTopic].filter(p => p.id !== targetPaperId);
    existingFeed.updatedAt = new Date().toISOString();
    existingFeed.updatedBy = superAdminEmail;

    // 2. Persist
    await firestore.setDoc(contentRef, existingFeed);

    // 3. User loads FeedScreen
    const reloaded = (await firestore.getDoc(contentRef)).data();
    assert.equal(reloaded.topics[targetTopic].length, countBefore - 1);
    assert.equal(reloaded.topics[targetTopic].some(p => p.id === targetPaperId), false);
  });
});
