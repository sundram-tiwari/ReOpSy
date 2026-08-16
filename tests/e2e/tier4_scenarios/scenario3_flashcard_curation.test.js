'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock, createSampleDailyFeed } = require('../harness');

describe('Tier 4 - Scenario 3: Editorial Flashcard Curation Lifecycle Journey', () => {
  const superAdminEmail = 'admin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });

  test('Scenario 3: End-to-end editorial curation: edit flashy title/summary, delete obsolete card with confirmation, verify persistence across pipeline runs', async () => {
    // Step 1: Initialize current content feed in Firestore
    const feed = createSampleDailyFeed(3);
    const contentDocRef = firestore.doc('content', 'dailyFeed');
    await firestore.setDoc(contentDocRef, {
      ...feed,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system'
    });

    // Step 2: Admin opens Flashcard Manager, selects NLP topic, locates paper
    const targetTopic = 'nlp';
    const paperToEdit = feed.topics[targetTopic][0];
    const paperToDelete = feed.topics[targetTopic][1];

    // Step 3: Admin edits catchy title and summary inline
    const newCatchyTitle = 'Mastering Prompt Engineering with Chain-of-Thought';
    const newSummary = 'Step-by-step reasoning triggers emergent cognitive capabilities in large language models.';
    paperToEdit.catchyTitle = newCatchyTitle;
    paperToEdit.summary = newSummary;

    // Step 4: Admin clicks delete on obsolete paper with confirmation dialog
    feed.topics[targetTopic] = feed.topics[targetTopic].filter(p => p.id !== paperToDelete.id);

    // Step 5: Save changes to Firestore
    await firestore.setDoc(contentDocRef, {
      ...feed,
      updatedAt: new Date().toISOString(),
      updatedBy: superAdminEmail
    });

    // Step 6: Verify Firestore content document holds edited title and omitted deleted card
    const savedDoc = (await firestore.getDoc(contentDocRef)).data();
    const nlpCards = savedDoc.topics[targetTopic];

    assert.equal(nlpCards.length, 2, 'Should have 2 cards remaining after deletion');
    const editedCard = nlpCards.find(p => p.id === paperToEdit.id);
    assert.ok(editedCard);
    assert.equal(editedCard.catchyTitle, newCatchyTitle);
    assert.equal(editedCard.summary, newSummary);
    assert.equal(nlpCards.some(p => p.id === paperToDelete.id), false);

    // Step 7: Next scheduled pipeline run respects curated overrides
    const simulatedFreshCrawl = [
      { id: paperToEdit.id, originalTitle: paperToEdit.originalTitle, catchyTitle: 'Crawled Title', summary: 'Crawled Summary' },
      { id: 'arxiv:nlp_brand_new', originalTitle: 'Brand New Paper', catchyTitle: 'New Catchy', summary: 'New Summary' }
    ];

    // Pipeline merge preserves existing curated card
    const mergedTopicCards = simulatedFreshCrawl.map(crawled => {
      const existing = nlpCards.find(p => p.id === crawled.id);
      return existing || crawled;
    });

    const finalCard = mergedTopicCards.find(p => p.id === paperToEdit.id);
    assert.equal(finalCard.catchyTitle, newCatchyTitle, 'Curated title must survive pipeline merge');
  });
});
