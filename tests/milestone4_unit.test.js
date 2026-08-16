'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { MockLlmHarness } = require('./helpers/mockLlm');
const { AstAuditor } = require('./helpers/astAuditor');
const { sanitizeLogMessage, validateApiConnection } = require('../app/testbuild/services/apiValidator');
const { fetchCustomTopicPapers } = require('../app/testbuild/services/customTopicFetcher');

describe('Milestone 4: Dedicated Unit & Integration Tests', () => {
  const auditor = new AstAuditor(path.resolve(__dirname, '../app'));

  describe('1. API Key Sanitization & Masking', () => {
    test('sanitizeLogMessage strips Gemini query param keys', () => {
      const unsafe = 'Failed at https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSySecretApiKey123';
      const clean = sanitizeLogMessage(unsafe, 'AIzaSySecretApiKey123');
      assert.ok(!clean.includes('AIzaSySecretApiKey123'));
      assert.ok(clean.includes('key=***') || clean.includes('***'));
    });

    test('sanitizeLogMessage strips Bearer Authorization tokens', () => {
      const unsafe = '401 Unauthorized for Authorization: Bearer sk-mistral-99887766554433';
      const clean = sanitizeLogMessage(unsafe, 'sk-mistral-99887766554433');
      assert.ok(!clean.includes('sk-mistral-99887766554433'));
      assert.ok(clean.includes('Bearer ***') || clean.includes('***'));
    });

    test('Empty API key check rejects immediately', async () => {
      const result = await validateApiConnection({ provider: 'Gemini', apiKey: '   ' });
      assert.equal(result.success, false);
      assert.ok(result.message.includes('empty'));
    });
  });

  describe('2. Live API Validation with Mock LLM Harness', () => {
    test('Validates Gemini endpoint connection', async () => {
      const harness = new MockLlmHarness();
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const res = await validateApiConnection({ provider: 'Gemini', apiKey: 'valid-gemini-key' });
        assert.equal(res.success, true);
        assert.ok(res.message.includes('Gemini'));
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('Validates Mistral endpoint connection', async () => {
      const harness = new MockLlmHarness();
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const res = await validateApiConnection({ provider: 'Mistral', apiKey: 'valid-mistral-key' });
        assert.equal(res.success, true);
        assert.ok(res.message.includes('Mistral'));
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('Validates Grok endpoint connection', async () => {
      const harness = new MockLlmHarness();
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const res = await validateApiConnection({ provider: 'Grok', apiKey: 'valid-grok-key' });
        assert.equal(res.success, true);
        assert.ok(res.message.includes('Grok'));
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('Handles validation failure and returns sanitized error message', async () => {
      const harness = new MockLlmHarness();
      harness.setFailure('gemini', true, 403, 'API key invalid: secret-key-bad');
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const res = await validateApiConnection({ provider: 'Gemini', apiKey: 'secret-key-bad' });
        assert.equal(res.success, false);
        assert.ok(!res.message.includes('secret-key-bad'));
      } finally {
        global.fetch = originalFetch;
        harness.clearFailures();
      }
    });
  });

  describe('3. Custom Topic Fetcher & Fallback Synthesis', () => {
    test('Fetches from arXiv, parses entries and tags with contentLevel 4 and topic custom', async () => {
      const harness = new MockLlmHarness();
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const papers = await fetchCustomTopicPapers('Explainable AI', {
          provider: 'Gemini',
          apiKey: 'test-key'
        }, 2);

        assert.ok(papers.length > 0, 'Should return parsed arXiv papers');
        const paper = papers[0];
        assert.deepEqual(paper.topics, ['custom']);
        assert.equal(paper.contentLevel, 4);
        assert.equal(paper.source, 'arxiv');
        assert.ok(paper.id.startsWith('arxiv:'));
        assert.ok(paper.catchyTitle.length > 0);
        assert.ok(paper.summary.length > 0);
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('Gracefully falls back to raw title and abstract when LLM fails', async () => {
      const harness = new MockLlmHarness();
      harness.setFailure('gemini', true, 500, 'Internal LLM Error');
      const originalFetch = global.fetch;
      global.fetch = harness.createMockFetch();

      try {
        const papers = await fetchCustomTopicPapers('Explainable AI', {
          provider: 'Gemini',
          apiKey: 'failing-key'
        }, 1);

        assert.ok(papers.length > 0);
        const paper = papers[0];
        assert.equal(paper.originalTitle, 'Explainable AI Techniques for Early Detection of Clinical Depression');
        assert.equal(paper.catchyTitle, 'Explainable AI Techniques for Early Detection of Clinical Depression');
        assert.ok(paper.summary.includes('gradient-weighted'));
      } finally {
        global.fetch = originalFetch;
        harness.clearFailures();
      }
    });

    test('Empty search query returns empty array without fetching', async () => {
      const papers = await fetchCustomTopicPapers('   ', { provider: 'Gemini', apiKey: 'k' });
      assert.deepEqual(papers, []);
    });
  });

  describe('4. UI & AST Verification', () => {
    test('SettingsScreen satisfies security and touch accessibility requirements', () => {
      const audit = auditor.auditSettingsSecurity();
      assert.ok(audit.hasSecureTextEntry, 'SettingsScreen must support secureTextEntry');
      assert.ok(audit.hasProviderSelection, 'SettingsScreen must support all 4 providers');
      assert.ok(audit.hasClearAction, 'SettingsScreen must support clear action');

      const content = auditor.readFile('src/screens/SettingsScreen.tsx');
      assert.ok(content.includes('eye') && content.includes('eye-off'), 'SettingsScreen must support eye toggle');
      assert.ok(content.includes('Masked Preview'), 'SettingsScreen must display masked preview');
      assert.ok(content.includes('validateApiConnection'), 'SettingsScreen must invoke validateApiConnection');
      assert.ok(content.includes('fetchCustomPapers') || content.includes('Fetch Topic Papers'), 'SettingsScreen must invoke fetch action');
    });

    test('TopicTabs dynamically renders custom tab with Feather target icon', () => {
      const content = auditor.readFile('src/components/TopicTabs.tsx');
      assert.ok(content.includes('custom'), 'TopicTabs must support custom topic slug');
      assert.ok(content.includes('target'), 'TopicTabs must use target icon for custom topic');
      assert.ok(content.includes('customTopic'), 'TopicTabs must display customTopic label');
    });

    test('FeedScreen isolates customFeedData from default dailyFeed', () => {
      const content = auditor.readFile('src/screens/FeedScreen.tsx');
      assert.ok(content.includes('customFeedData'), 'FeedScreen must reference customFeedData');
      assert.ok(content.includes("activeTopic === 'custom'"), 'FeedScreen must check for activeTopic custom');
    });

    test('Firestore Security Rules enforce strict owner-only access', () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
      assert.ok(rules.includes('/users/{userId}'), 'Rules must match /users/{userId}');
      assert.ok(rules.includes('request.auth.uid == userId'), 'Rules must check request.auth.uid == userId');
      assert.ok(rules.includes('request.auth != null'), 'Rules must check request.auth != null');
    });
  });
});
