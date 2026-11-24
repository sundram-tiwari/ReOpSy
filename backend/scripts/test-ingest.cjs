'use strict';
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const directory = join(__dirname, '../ingest/test');
const tests = readdirSync(directory).filter((name) => name.endsWith('.test.js')).sort();
if (!tests.length) throw new Error('No ingest test files found.');
const run = spawnSync(process.execPath, ['--test', ...tests.map((test) => join(directory, test))], { stdio: 'inherit' });
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
