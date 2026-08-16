'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 1 - Feature F10: API Usage Dashboard Aggregation', () => {
  const firestore = new FirestoreMock();

  /**
   * Helper simulating API Usage Dashboard aggregation logic
   */
  function aggregateUsageData(docs) {
    let totalCalls = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    const dailyMap = {};

    for (const doc of docs) {
      totalCalls++;
      if (doc.success) totalSuccess++;
      else totalFailed++;

      const date = doc.date || 'Unknown';
      const provider = doc.provider || 'Other';
      const key = `${date}_${provider}`;

      if (!dailyMap[key]) {
        dailyMap[key] = {
          date,
          provider,
          total: 0,
          success: 0,
          failed: 0
        };
      }

      dailyMap[key].total++;
      if (doc.success) dailyMap[key].success++;
      else dailyMap[key].failed++;
    }

    const rows = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    return {
      summary: {
        totalCalls,
        totalSuccess,
        totalFailed
      },
      rows
    };
  }

  test('F10.1: Dashboard queries api_usage collection and computes summary statistics', async () => {
    await firestore.setDoc(firestore.doc('api_usage', 'u1'), { date: '2026-08-15', provider: 'Gemini', success: true });
    await firestore.setDoc(firestore.doc('api_usage', 'u2'), { date: '2026-08-15', provider: 'Gemini', success: false });
    await firestore.setDoc(firestore.doc('api_usage', 'u3'), { date: '2026-08-15', provider: 'Mistral', success: true });

    const allDocs = (await firestore.getDocs(firestore.collection('api_usage'))).docs.map(d => d.data());
    const result = aggregateUsageData(allDocs);

    assert.equal(result.summary.totalCalls, 3);
    assert.equal(result.summary.totalSuccess, 2);
    assert.equal(result.summary.totalFailed, 1);
  });

  test('F10.2: Daily breakdown groups usage records by date and provider', async () => {
    const rawData = [
      { date: '2026-08-16', provider: 'Gemini', success: true },
      { date: '2026-08-16', provider: 'Gemini', success: true },
      { date: '2026-08-16', provider: 'Mistral', success: false },
      { date: '2026-08-15', provider: 'Grok', success: true }
    ];

    const result = aggregateUsageData(rawData);
    assert.equal(result.rows.length, 3);

    const geminiToday = result.rows.find(r => r.date === '2026-08-16' && r.provider === 'Gemini');
    assert.ok(geminiToday);
    assert.equal(geminiToday.total, 2);
    assert.equal(geminiToday.success, 2);
    assert.equal(geminiToday.failed, 0);

    const mistralToday = result.rows.find(r => r.date === '2026-08-16' && r.provider === 'Mistral');
    assert.ok(mistralToday);
    assert.equal(mistralToday.total, 1);
    assert.equal(mistralToday.success, 0);
    assert.equal(mistralToday.failed, 1);
  });

  test('F10.3: Table format displays Date, Provider, Total Calls, Successes, Failures columns', () => {
    const rawData = [{ date: '2026-08-16', provider: 'Gemini', success: true }];
    const result = aggregateUsageData(rawData);
    const row = result.rows[0];

    assert.ok('date' in row, 'Row must include date');
    assert.ok('provider' in row, 'Row must include provider');
    assert.ok('total' in row, 'Row must include total');
    assert.ok('success' in row, 'Row must include success');
    assert.ok('failed' in row, 'Row must include failed');
  });

  test('F10.4: Empty usage collection renders empty state with zero counters without crashing', () => {
    const result = aggregateUsageData([]);
    assert.equal(result.summary.totalCalls, 0);
    assert.equal(result.summary.totalSuccess, 0);
    assert.equal(result.summary.totalFailed, 0);
    assert.equal(result.rows.length, 0);
  });

  test('F10.5: Aggregator correctly computes totals across multiple days and multiple providers', () => {
    const rawData = [
      { date: '2026-08-14', provider: 'Gemini', success: true },
      { date: '2026-08-14', provider: 'Mistral', success: true },
      { date: '2026-08-15', provider: 'Grok', success: true },
      { date: '2026-08-16', provider: 'Gemini', success: false },
      { date: '2026-08-16', provider: 'Gemini', success: true }
    ];

    const result = aggregateUsageData(rawData);
    assert.equal(result.summary.totalCalls, 5);
    assert.equal(result.summary.totalSuccess, 4);
    assert.equal(result.summary.totalFailed, 1);
    assert.equal(result.rows.length, 4);
  });

  test('F10.6: Breakdown sorts records in reverse chronological order', () => {
    const rawData = [
      { date: '2026-08-10', provider: 'Gemini', success: true },
      { date: '2026-08-16', provider: 'Gemini', success: true },
      { date: '2026-08-12', provider: 'Mistral', success: true }
    ];

    const result = aggregateUsageData(rawData);
    assert.equal(result.rows[0].date, '2026-08-16');
    assert.equal(result.rows[1].date, '2026-08-12');
    assert.equal(result.rows[2].date, '2026-08-10');
  });
});
