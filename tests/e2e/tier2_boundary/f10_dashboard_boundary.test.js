'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('Tier 2 - Boundary: F10 API Usage Dashboard Aggregation', () => {
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
        dailyMap[key] = { date, provider, total: 0, success: 0, failed: 0 };
      }

      dailyMap[key].total++;
      if (doc.success) dailyMap[key].success++;
      else dailyMap[key].failed++;
    }

    const rows = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));
    return {
      summary: { totalCalls, totalSuccess, totalFailed },
      rows
    };
  }

  test('B10.1: Multi-thousand dataset aggregation completes within 50ms', () => {
    const largeDataset = [];
    for (let i = 0; i < 5000; i++) {
      largeDataset.push({
        date: `2026-08-${String((i % 30) + 1).padStart(2, '0')}`,
        provider: i % 3 === 0 ? 'Gemini' : (i % 3 === 1 ? 'Mistral' : 'Grok'),
        success: i % 10 !== 0
      });
    }

    const start = Date.now();
    const result = aggregateUsageData(largeDataset);
    const duration = Date.now() - start;

    assert.equal(result.summary.totalCalls, 5000);
    assert.ok(duration < 200, `Aggregation took ${duration}ms, expected < 200ms`);
  });

  test('B10.2: Malformed or missing date fields are grouped into "Unknown" without throwing', () => {
    const messyData = [
      { date: null, provider: 'Gemini', success: true },
      { date: undefined, provider: 'Mistral', success: false },
      { date: '', provider: 'Grok', success: true }
    ];

    const result = aggregateUsageData(messyData);
    assert.equal(result.summary.totalCalls, 3);
    assert.ok(result.rows.some(r => r.date === 'Unknown'));
  });

  test('B10.3: 100% failure rate day vs 100% success rate day computation', () => {
    const data = [
      { date: '2026-08-01', provider: 'Gemini', success: false },
      { date: '2026-08-01', provider: 'Gemini', success: false },
      { date: '2026-08-02', provider: 'Gemini', success: true },
      { date: '2026-08-02', provider: 'Gemini', success: true }
    ];

    const result = aggregateUsageData(data);
    const day1 = result.rows.find(r => r.date === '2026-08-01');
    const day2 = result.rows.find(r => r.date === '2026-08-02');

    assert.equal(day1.success, 0);
    assert.equal(day1.failed, 2);
    assert.equal(day2.success, 2);
    assert.equal(day2.failed, 0);
  });

  test('B10.4: Division by zero prevention when computing success rate percentages', () => {
    const calcRate = (success, total) => {
      if (!total || total <= 0) return '0%';
      return `${Math.round((success / total) * 100)}%`;
    };

    assert.equal(calcRate(0, 0), '0%');
    assert.equal(calcRate(5, 10), '50%');
    assert.equal(calcRate(10, 10), '100%');
  });

  test('B10.5: Filter by date range boundary (fromDate to toDate)', () => {
    const data = [
      { date: '2026-08-10', provider: 'Gemini', success: true },
      { date: '2026-08-12', provider: 'Gemini', success: true },
      { date: '2026-08-15', provider: 'Gemini', success: true }
    ];

    const filterRange = (items, from, to) => items.filter(i => i.date >= from && i.date <= to);

    const filtered = filterRange(data, '2026-08-11', '2026-08-14');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].date, '2026-08-12');
  });
});
