'use strict';

/**
 * Mock Network / LLM Response Factory for E2E testing
 */
class MockLlmHarness {
  constructor() {
    this.geminiResponses = new Map();
    this.mistralResponses = new Map();
    this.grokResponses = new Map();
    this.semanticScholarResponses = new Map();
    this.callCounts = {
      gemini: 0,
      mistral: 0,
      grok: 0,
      semanticScholar: 0,
      arxiv: 0
    };
    this.failures = {
      gemini: false,
      mistral: false,
      grok: false,
      semanticScholar: false,
      arxiv: false
    };
  }

  setFailure(service, shouldFail = true, statusCode = 500, errorMsg = 'Mock Service Error') {
    this.failures[service] = { shouldFail, statusCode, errorMsg };
  }

  clearFailures() {
    this.failures = {
      gemini: false,
      mistral: false,
      grok: false,
      semanticScholar: false,
      arxiv: false
    };
  }

  setSemanticScholarTldr(paperTitle, tldr) {
    this.semanticScholarResponses.set(paperTitle.toLowerCase().trim(), tldr);
  }

  /**
   * Mock implementation of fetch for testing external API calls
   */
  createMockFetch() {
    return async (url, options = {}) => {
      const urlStr = String(url);

      // 1. Semantic Scholar API
      if (urlStr.includes('api.semanticscholar.org')) {
        this.callCounts.semanticScholar++;
        if (this.failures.semanticScholar && this.failures.semanticScholar.shouldFail) {
          return {
            ok: false,
            status: this.failures.semanticScholar.statusCode,
            json: async () => ({ error: this.failures.semanticScholar.errorMsg }),
            text: async () => this.failures.semanticScholar.errorMsg
          };
        }

        const match = urlStr.match(/query=([^&]+)/);
        const query = match ? decodeURIComponent(match[1]).toLowerCase().trim() : '';
        const tldr = this.semanticScholarResponses.get(query);

        if (tldr) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: [{
                title: query,
                tldr: { text: tldr }
              }]
            })
          };
        } else {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: [] })
          };
        }
      }

      // 2. Google Gemini API
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        this.callCounts.gemini++;
        if (this.failures.gemini && this.failures.gemini.shouldFail) {
          return {
            ok: false,
            status: this.failures.gemini.statusCode,
            text: async () => this.failures.gemini.errorMsg,
            json: async () => ({ error: { message: this.failures.gemini.errorMsg } })
          };
        }

        // Return catchy title response or structured JSON
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{ text: 'AI Breakthrough: Smarter Models in Real Time' }]
              }
            }]
          }),
          text: async () => JSON.stringify({
            candidates: [{
              content: {
                parts: [{ text: 'AI Breakthrough: Smarter Models in Real Time' }]
              }
            }]
          })
        };
      }

      // 3. Mistral API
      if (urlStr.includes('api.mistral.ai')) {
        this.callCounts.mistral++;
        if (this.failures.mistral && this.failures.mistral.shouldFail) {
          return {
            ok: false,
            status: this.failures.mistral.statusCode,
            text: async () => this.failures.mistral.errorMsg,
            json: async () => ({ message: this.failures.mistral.errorMsg })
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: { content: 'Mistral Insight: Next-Gen Neural Efficiency' }
            }]
          }),
          text: async () => JSON.stringify({
            choices: [{
              message: { content: 'Mistral Insight: Next-Gen Neural Efficiency' }
            }]
          })
        };
      }

      // 4. Grok (xAI) API
      if (urlStr.includes('api.x.ai')) {
        this.callCounts.grok++;
        if (this.failures.grok && this.failures.grok.shouldFail) {
          return {
            ok: false,
            status: this.failures.grok.statusCode,
            text: async () => this.failures.grok.errorMsg,
            json: async () => ({ message: this.failures.grok.errorMsg })
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: { content: 'Grok Flash: The Fast Future of AI' }
            }]
          }),
          text: async () => JSON.stringify({
            choices: [{
              message: { content: 'Grok Flash: The Fast Future of AI' }
            }]
          })
        };
      }

      // 5. arXiv Search API
      if (urlStr.includes('export.arxiv.org')) {
        this.callCounts.arxiv++;
        if (this.failures.arxiv && this.failures.arxiv.shouldFail) {
          return {
            ok: false,
            status: this.failures.arxiv.statusCode,
            text: async () => '<error>arXiv temporary failure</error>'
          };
        }

        const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2402.01234v1</id>
    <published>2024-02-01T12:00:00Z</published>
    <title>Explainable AI Techniques for Early Detection of Clinical Depression</title>
    <summary>This paper investigates gradient-weighted class activation mapping applied to electroencephalogram recordings for interpreting neural biomarkers of depressive disorders.</summary>
    <author><name>Dr. Alex Mercer</name></author>
    <author><name>Dr. Sarah Chen</name></author>
  </entry>
</feed>`;
        return {
          ok: true,
          status: 200,
          text: async () => sampleXml
        };
      }

      throw new Error(`Unhandled mock fetch URL: ${urlStr}`);
    };
  }
}

module.exports = {
  MockLlmHarness
};
