#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const E2E_ROOT = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const TIERS = [
  {
    tier: 'Tier 1',
    name: 'Tier 1: Feature Coverage (F1 - F12)',
    dir: path.join(E2E_ROOT, 'tier1_features')
  },
  {
    tier: 'Tier 2',
    name: 'Tier 2: Boundary & Corner Cases (F1 - F12)',
    dir: path.join(E2E_ROOT, 'tier2_boundary')
  },
  {
    tier: 'Tier 3',
    name: 'Tier 3: Cross-Feature Integration Matrix',
    dir: path.join(E2E_ROOT, 'tier3_integration')
  },
  {
    tier: 'Tier 4',
    name: 'Tier 4: Real-World Application Scenarios (S1 - S6)',
    dir: path.join(E2E_ROOT, 'tier4_scenarios')
  },
  {
    tier: 'Tier 5',
    name: 'Tier 5: Adversarial Coverage Hardening (T5.1 - T5.5)',
    dir: path.join(E2E_ROOT, 'tier5_adversarial')
  }
];

console.log('================================================================');
console.log('   ReOpSy "Mission Control" Admin Panel — Master E2E Test Runner');
console.log('================================================================\n');

let totalFilesPassed = 0;
let totalFilesFailed = 0;
const results = [];
const startTime = Date.now();

// Filter tiers if specified via CLI
let targetTiers = TIERS;
const tierArgIndex = process.argv.findIndex(arg => arg.startsWith('--tier=') || arg === '--tier' || arg === '-t');
if (tierArgIndex !== -1) {
  const arg = process.argv[tierArgIndex];
  const tierNum = arg.includes('=') ? arg.split('=')[1] : process.argv[tierArgIndex + 1];
  if (tierNum) {
    targetTiers = TIERS.filter(t => t.tier.toLowerCase().includes(tierNum.toLowerCase()) || t.name.toLowerCase().includes(tierNum.toLowerCase()));
  }
}

for (const tier of targetTiers) {
  console.log(`----------------------------------------------------------------`);
  console.log(`▶ Running ${tier.name}...`);
  console.log(`----------------------------------------------------------------`);

  if (!fs.existsSync(tier.dir)) {
    console.warn(`⚠️ Directory not found: ${tier.dir}`);
    continue;
  }

  const files = fs.readdirSync(tier.dir).filter(f => f.endsWith('.test.js')).sort();

  for (const file of files) {
    const filePath = path.join(tier.dir, file);
    process.stdout.write(`  • ${file.padEnd(45)} `);

    const proc = spawnSync(process.execPath, ['--test', filePath], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    });

    if (proc.status === 0) {
      console.log('✅ PASS');
      totalFilesPassed++;
      results.push({ tier: tier.tier, file, status: 'PASS' });
    } else {
      console.log('❌ FAIL');
      totalFilesFailed++;
      results.push({ tier: tier.tier, file, status: 'FAIL', error: proc.stderr || proc.stdout });
      if (proc.stdout) {
        console.error('\n' + proc.stdout.split('\n').map(l => '    ' + l).join('\n'));
      }
      if (proc.stderr) {
        console.error('\n' + proc.stderr.split('\n').map(l => '    ' + l).join('\n'));
      }
    }
  }
  console.log('');
}

const duration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('================================================================');
console.log('                     E2E Test Results Summary');
console.log('================================================================');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(` ${icon} [${r.tier}] ${r.file.padEnd(46)} [${r.status}]`);
}
console.log('----------------------------------------------------------------');
console.log(` Total Suites: ${results.length} | Passed: ${totalFilesPassed} | Failed: ${totalFilesFailed} | Duration: ${duration}s`);
console.log('================================================================\n');

if (totalFilesFailed > 0) {
  console.error(`❌ E2E Test Suite failed with ${totalFilesFailed} failing test file(s).`);
  process.exit(1);
} else {
  console.log('🎉 All E2E Test Tiers (100% test files) passed successfully!');
  process.exit(0);
}
