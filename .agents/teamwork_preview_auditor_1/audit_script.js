'use strict';

const fs = require('fs');
const path = require('path');

function walkDir(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const rootDir = path.resolve(__dirname, '../..');
const appFiles = walkDir(path.join(rootDir, 'app', 'src'));
const backendFiles = [
  ...walkDir(path.join(rootDir, 'backend', 'pipeline')),
  ...walkDir(path.join(rootDir, 'backend', 'db')),
  ...walkDir(path.join(rootDir, 'backend', 'ingest'))
];

const allFiles = [...appFiles, ...backendFiles];

console.log(`Auditing ${allFiles.length} source files in ${rootDir}...`);

let issues = [];

allFiles.forEach(f => {
  if (!f.endsWith('.ts') && !f.endsWith('.tsx') && !f.endsWith('.js') && !f.endsWith('.json')) return;
  const content = fs.readFileSync(f, 'utf8');

  // Check 1: Hardcoded test passes or stubs
  if (content.includes('__TEST_BYPASS__') || content.includes('return true; // dummy')) {
    issues.push({ file: f, check: 'Hardcoded bypass or dummy return' });
  }

  // Check 2: Raw plaintext logging of sensitive keys
  if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) {
    if (/console\.(log|info|warn|error)\([^)]*apiKey[^)]*\)/.test(content)) {
      // Check if sanitized
      if (!content.includes('sanitizeLogMessage') && !content.includes('***')) {
        issues.push({ file: f, check: 'Potential unsanitized API key logging' });
      }
    }
  }

  // Check 3: Check for empty functions or NotImplementedError
  if (/function[^{]*\{\s*\}/.test(content) && !f.includes('test')) {
    issues.push({ file: f, check: 'Empty function body' });
  }
});

console.log(`Audit complete. Total issues found: ${issues.length}`);
if (issues.length > 0) {
  console.log(issues);
}
