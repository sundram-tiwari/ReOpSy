#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const TIERS = [
  { name: 'Tier 1: Feature Coverage (R1 - R5)', file: 'tier1_features.test.js' },
  { name: 'Tier 2: Boundary & Corner Cases', file: 'tier2_boundaries.test.js' },
  { name: 'Tier 3: Cross-Feature Combinations', file: 'tier3_combinatorial.test.js' },
  { name: 'Tier 4: Real-World Workload Scenarios', file: 'tier4_workloads.test.js' }
];

console.log('================================================================');
console.log('         ReOpSy Version 2 — Master E2E Test Suite');
console.log('================================================================\n');

let totalPassed = 0;
let totalFailed = 0;
const results = [];

const startTime = Date.now();

for (const tier of TIERS) {
  const filePath = path.join(__dirname, tier.file);
  console.log(`▶ Running ${tier.name}...`);

  const proc = spawnSync(process.execPath, ['--test', filePath], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..')
  });

  const passed = proc.status === 0;
  if (passed) {
    totalPassed++;
    results.push({ name: tier.name, status: 'PASS' });
  } else {
    totalFailed++;
    results.push({ name: tier.name, status: 'FAIL', code: proc.status });
  }
  console.log('');
}

const duration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('================================================================');
console.log('                     E2E Test Results Summary');
console.log('================================================================');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(` ${icon} ${r.name.padEnd(48)} [${r.status}]`);
}
console.log('----------------------------------------------------------------');
console.log(` Total Tiers: ${TIERS.length} | Passed: ${totalPassed} | Failed: ${totalFailed} | Duration: ${duration}s`);
console.log('================================================================\n');

if (totalFailed > 0) {
  console.error(`❌ Master E2E Suite failed with ${totalFailed} failing tier(s).`);
  process.exit(1);
} else {
  console.log('🎉 All 4 E2E Test Tiers passed successfully!');
  process.exit(0);
}
