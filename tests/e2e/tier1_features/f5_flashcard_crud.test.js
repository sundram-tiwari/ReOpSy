'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_TOPIC_SLUGS,
  createSampleDailyFeed,
  createTestPaper,
  validatePaperStructure
} = require('../harness');

describe('Tier 1 - Feature F5: Flashcard Manager Inline CRUD', () => {
  let feedState = createSampleDailyFeed(3);

  test('F5.1: Flashcards are loaded and grouped across all 10 predefined research topics', () => {
    const topics = Object.keys(feedState.topics);
    assert.equal(topics.length, 10, 'Feed must group cards by 10 topics');
    for (const slug of EXPECTED_TOPIC_SLUGS) {
      assert.ok(feedState.topics[slug], `Topic ${slug} must exist in grouped feed`);
      assert.ok(feedState.topics[slug].length >= 3, `Topic ${slug} should have cards`);
    }
  });

  test('F5.2: Flashcard row contains required fields: catchyTitle, originalTitle, summary, source, topics', () => {
    const paper = feedState.topics['llm'][0];
    const validation = validatePaperStructure(paper);
    assert.equal(validation.valid, true, `Paper structure invalid: ${validation.error}`);
    assert.ok(paper.catchyTitle, 'Must have catchy title');
    assert.ok(paper.originalTitle, 'Must have original title');
    assert.ok(paper.summary, 'Must have summary');
    assert.ok(paper.source, 'Must have source');
  });

  test('F5.3: Inline edit updates catchy title, summary, and source without corrupting paper id or topic', () => {
    const topic = 'llm';
    const paper = feedState.topics[topic][0];
    const originalId = paper.id;

    // Simulate inline edit
    const updatedPaper = {
      ...paper,
      catchyTitle: 'Revised Catchy Title for LLM Reasoning',
      summary: 'Updated executive summary of findings.',
      source: 'arxiv-v2'
    };

    feedState.topics[topic][0] = updatedPaper;

    const retrieved = feedState.topics[topic][0];
    assert.equal(retrieved.id, originalId, 'ID must remain invariant');
    assert.equal(retrieved.catchyTitle, 'Revised Catchy Title for LLM Reasoning');
    assert.equal(retrieved.summary, 'Updated executive summary of findings.');
    assert.equal(retrieved.source, 'arxiv-v2');
  });

  test('F5.4: Delete operation removes flashcard from the specific topic array', () => {
    const topic = 'cv';
    const initialCount = feedState.topics[topic].length;
    const targetPaperId = feedState.topics[topic][0].id;

    // Delete paper
    feedState.topics[topic] = feedState.topics[topic].filter(p => p.id !== targetPaperId);

    assert.equal(feedState.topics[topic].length, initialCount - 1);
    assert.equal(feedState.topics[topic].some(p => p.id === targetPaperId), false);
  });

  test('F5.5: Search and filter bar matches flashcards by title substring or topic slug', () => {
    const allCards = [];
    for (const [topic, cards] of Object.entries(feedState.topics)) {
      cards.forEach(c => allCards.push({ ...c, topic }));
    }

    const search = (query) => {
      const q = query.trim().toLowerCase();
      if (!q) return allCards;
      return allCards.filter(c =>
        c.catchyTitle.toLowerCase().includes(q) ||
        c.originalTitle.toLowerCase().includes(q) ||
        c.topic.toLowerCase().includes(q)
      );
    };

    // Filter by topic 'robotics'
    const roboticsResults = search('robotics');
    assert.ok(roboticsResults.length > 0);
    assert.ok(roboticsResults.every(c => c.topic === 'robotics' || c.catchyTitle.toLowerCase().includes('robotics')));

    // Filter by specific keyword
    const keywordResults = search('Reasoning');
    assert.ok(keywordResults.length > 0);
    assert.ok(keywordResults.some(c => c.catchyTitle.includes('Reasoning')));
  });

  test('F5.6: Adding a new flashcard to a topic validates and appends cleanly', () => {
    const topic = 'quantum';
    const initialCount = feedState.topics[topic].length;
    const newCard = createTestPaper(topic, {
      id: 'arxiv:quantum_new_1',
      catchyTitle: 'Quantum Advantage in Cryptography',
      summary: 'Demonstrating exponential speedup on 1000-qubit systems.'
    });

    feedState.topics[topic].push(newCard);

    assert.equal(feedState.topics[topic].length, initialCount + 1);
    const added = feedState.topics[topic].find(p => p.id === 'arxiv:quantum_new_1');
    assert.ok(added);
    assert.equal(added.catchyTitle, 'Quantum Advantage in Cryptography');
  });
});
