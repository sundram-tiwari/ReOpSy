#!/usr/bin/env node
'use strict';

/**
 * Build a copyright deposit for ReOpSy.
 *
 *   node scripts/make-copyright-deposit.js
 *
 * Produces, in dist/copyright/:
 *   deposit.html     — print to PDF from your browser, then upload
 *   MANIFEST.txt     — the file list with sizes and line counts
 *   SECRET-SCAN.txt  — anything that looks like a credential
 *
 * Two things this script exists to get right:
 *
 * 1. **Order.** The Indian Copyright Office asks for the first and last 25
 *    pages of source for a Form XIV filing. Whatever leads the deposit is what
 *    an examiner actually reads, so the distinctive code goes first —
 *    SwipeDeck, deck, streak, AppState, DeckScreen, PaperCard — rather than
 *    whichever file happens to sort first alphabetically.
 *
 * 2. **Secrets.** The deposit becomes a public record. A key that ships in it
 *    is a key you have published. The scan below is conservative and noisy on
 *    purpose; read the report before you file.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist', 'copyright');

const WORK_TITLE = 'ReOpSy — a swipe-based reading interface for scientific literature';
const AUTHOR = '[[YOUR NAME]]';
const YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// which files go in
// ---------------------------------------------------------------------------
const INCLUDE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.sql', '.json', '.yml', '.yaml']);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.expo', 'dist', 'build', 'web-build',
  'testbuild', 'android', 'ios', 'coverage', '.vscode', '.idea',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'expo-env.d.ts', '.eslintcache',
]);

/**
 * The files that make this program *this* program, in the order an examiner
 * should meet them. Anything not listed follows in a stable path order.
 */
const LEAD_FILES = [
  'app/src/components/SwipeDeck.tsx',
  'app/src/logic/deck.ts',
  'app/src/logic/streak.ts',
  'app/src/state/AppState.tsx',
  'app/src/screens/DeckScreen.tsx',
  'app/src/components/PaperCard.tsx',
  'app/src/logic/bibtex.ts',
  'app/src/logic/date.ts',
  'app/src/state/storage.ts',
  'backend/ingest/lib/summarize.js',
  'backend/ingest/lib/openalex.js',
  'backend/ingest/lib/arxiv.js',
  'backend/ingest/lib/dedupe.js',
  'backend/schema.sql',
];

// ---------------------------------------------------------------------------
// secret scanning
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  { name: 'JWT / Supabase key', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Bearer literal', re: /Bearer\s+[A-Za-z0-9_\-.]{24,}/ },
  { name: 'Assigned secret', re: /(?:api[_-]?key|secret|password|passwd|token|credential)\s*[:=]\s*['"][^'"\s]{12,}['"]/i },
  { name: 'Supabase URL with project ref', re: /https:\/\/[a-z0-9]{20}\.supabase\.co/ },
];

/**
 * Lines that mention a credential *name* without carrying a value — a `.env`
 * key, a `process.env.X` read, a placeholder — are not findings. Reporting them
 * trains you to ignore the report, which is how a real key gets through.
 */
const BENIGN = [
  /process\.env/,
  /EXPO_PUBLIC_[A-Z_]+\s*=?\s*$/,
  /\[\[[A-Z ]+\]\]/,
  /(CHANGEME|xxxx+|your-?key|example\.com|placeholder)/i,
  /^\s*(\/\/|\*|#|--)/,          // a comment line
  /eyJhbGciOi\.\.\./,            // the truncated sample in .env.example
];

function scanFile(relPath, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    if (BENIGN.some((re) => re.test(line))) return;

    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) {
        findings.push({
          file: relPath,
          line: i + 1,
          kind: name,
          excerpt: line.trim().slice(0, 120),
        });
      }
    }
  });

  return findings;
}

// ---------------------------------------------------------------------------
// walking
// ---------------------------------------------------------------------------
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, acc);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      if (!INCLUDE_EXT.has(path.extname(entry.name))) continue;
      acc.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return acc;
}

function orderFiles(all) {
  const lead = LEAD_FILES.filter((f) => all.includes(f));
  const rest = all.filter((f) => !lead.includes(f)).sort();
  return [...lead, ...rest];
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------
const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderFile(relPath, text, index) {
  const lines = text.split(/\r?\n/);
  const numbered = lines
    .map((line, i) => `<tr><td class="ln">${i + 1}</td><td class="src">${escapeHtml(line) || '&nbsp;'}</td></tr>`)
    .join('\n');

  return `
<section class="file">
  <h2>${index}. ${escapeHtml(relPath)}</h2>
  <div class="meta">${lines.length} lines</div>
  <table class="code">${numbered}</table>
</section>`;
}

function renderDocument({ files, contents, findings }) {
  const totalLines = files.reduce((n, f) => n + contents[f].split(/\r?\n/).length, 0);

  const toc = files
    .map((f, i) => `<li><span class="n">${i + 1}.</span> ${escapeHtml(f)} <span class="dots"></span> <span class="ll">${contents[f].split(/\r?\n/).length} lines</span></li>`)
    .join('\n');

  const body = files.map((f, i) => renderFile(f, contents[f], i + 1)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Copyright deposit — ReOpSy</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  body { font: 11pt/1.45 Georgia, serif; color: #111; }
  code, .src, .ln { font-family: "DejaVu Sans Mono", Consolas, Menlo, monospace; }
  h1 { font-size: 20pt; margin: 0 0 4pt; }
  h2 { font-size: 11pt; margin: 0 0 2pt; padding: 4pt 0; border-bottom: 1px solid #999; }
  .cover { page-break-after: always; }
  .cover dl { margin-top: 24pt; }
  .cover dt { font-weight: bold; margin-top: 10pt; }
  .cover dd { margin: 0 0 0 0; }
  .note { margin-top: 28pt; padding: 10pt; border: 1px solid #bbb; background: #f7f7f7; font-size: 9.5pt; }
  .toc { page-break-after: always; }
  .toc ol { list-style: none; padding: 0; font-size: 9.5pt; }
  .toc li { display: flex; gap: 6pt; padding: 1.5pt 0; }
  .toc .n { width: 26pt; text-align: right; color: #666; }
  .toc .dots { flex: 1; border-bottom: 1px dotted #bbb; margin-bottom: 3pt; }
  .toc .ll { color: #666; }
  section.file { page-break-before: always; }
  .meta { font-size: 8.5pt; color: #666; margin-bottom: 6pt; }
  table.code { border-collapse: collapse; width: 100%; font-size: 7.6pt; line-height: 1.32; }
  td.ln { width: 30pt; text-align: right; padding-right: 8pt; color: #999; vertical-align: top;
          user-select: none; border-right: 1px solid #ddd; }
  td.src { padding-left: 8pt; white-space: pre-wrap; word-break: break-word; vertical-align: top; }
</style>
</head>
<body>

<div class="cover">
  <h1>Deposit of Computer Programme</h1>
  <p>Filed under Form XIV, Copyright Rules, 2013 (India)</p>

  <dl>
    <dt>Title of work</dt><dd>${escapeHtml(WORK_TITLE)}</dd>
    <dt>Class</dt><dd>Literary work — Computer Programme</dd>
    <dt>Author</dt><dd>${escapeHtml(AUTHOR)}</dd>
    <dt>Applicant</dt><dd>${escapeHtml(AUTHOR)}</dd>
    <dt>Year of first publication</dt><dd>${YEAR}</dd>
    <dt>Language</dt><dd>TypeScript, JavaScript, SQL</dd>
    <dt>Source files in this deposit</dt><dd>${files.length}</dd>
    <dt>Total lines</dt><dd>${totalLines.toLocaleString()}</dd>
    <dt>Deposit generated</dt><dd>${new Date().toISOString().slice(0, 10)}</dd>
  </dl>

  <div class="note">
    <strong>Note on ordering.</strong> Source files appear in order of
    distinctiveness rather than alphabetically. The first files listed contain
    the original expression particular to this work: the gesture-driven card
    deck, the deterministic daily deck construction, the streak and freeze
    rules, the application state machine, and the extractive summarisation and
    record-reconciliation logic in the ingest pipeline. Configuration,
    presentation and test files follow.
    <br><br>
    <strong>Secret scan.</strong> ${
      findings.length === 0
        ? 'An automated scan for credentials found nothing in the deposited files.'
        : `<span style="color:#a00"><strong>${findings.length} potential credential(s) were flagged.</strong> See SECRET-SCAN.txt. Do not file until resolved.</span>`
    }
  </div>
</div>

<div class="toc">
  <h1>Contents</h1>
  <ol>${toc}</ol>
</div>

${body}

</body>
</html>`;
}

// ---------------------------------------------------------------------------
function main() {
  const all = walk(ROOT);
  const files = orderFiles(all);

  if (files.length === 0) {
    console.error('No source files found. Run this from the repository root.');
    return 1;
  }

  const contents = {};
  const findings = [];
  let bytes = 0;

  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    contents[rel] = text;
    bytes += Buffer.byteLength(text);
    findings.push(...scanFile(rel, text));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // deposit.html
  fs.writeFileSync(path.join(OUT_DIR, 'deposit.html'), renderDocument({ files, contents, findings }));

  // MANIFEST.txt
  const manifest = [
    `ReOpSy — copyright deposit manifest`,
    `Generated ${new Date().toISOString()}`,
    `${files.length} files, ${bytes.toLocaleString()} bytes`,
    '',
    'Order is by distinctiveness: the files that carry the original expression',
    'of this work come first, the remainder follow in path order.',
    '',
    ...files.map((f, i) => {
      const lines = contents[f].split(/\r?\n/).length;
      const lead = i < LEAD_FILES.filter((x) => files.includes(x)).length ? ' *' : '  ';
      return `${String(i + 1).padStart(3)}.${lead} ${f.padEnd(58)} ${String(lines).padStart(6)} lines`;
    }),
    '',
    '* = core distinctive file, placed in the opening pages',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'MANIFEST.txt'), manifest + '\n');

  // SECRET-SCAN.txt
  const scan = findings.length === 0
    ? [
        'ReOpSy — secret scan',
        `Generated ${new Date().toISOString()}`,
        `${files.length} files scanned against ${SECRET_PATTERNS.length} patterns.`,
        '',
        'CLEAN — no credential-shaped strings found.',
        '',
        'This is not a guarantee. Skim the deposit before filing; it becomes a',
        'public record and cannot be recalled.',
      ].join('\n')
    : [
        'ReOpSy — secret scan',
        `Generated ${new Date().toISOString()}`,
        '',
        `!! ${findings.length} POTENTIAL CREDENTIAL(S) FOUND — DO NOT FILE YET !!`,
        '',
        ...findings.map((f) => `${f.file}:${f.line}\n  kind: ${f.kind}\n  line: ${f.excerpt}\n`),
        'Remove or rotate anything real, then re-run this script.',
      ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'SECRET-SCAN.txt'), scan + '\n');

  // ── report ──
  console.log(`\nCopyright deposit written to ${path.relative(process.cwd(), OUT_DIR)}\n`);
  console.log(`  ${files.length} files, ${bytes.toLocaleString()} bytes`);
  console.log(`  leading with: ${files.slice(0, 4).join(', ')}`);
  console.log(findings.length === 0
    ? '  secret scan: CLEAN'
    : `  secret scan: ${findings.length} FINDING(S) — read SECRET-SCAN.txt before filing`);
  console.log('\nNext: open deposit.html in a browser and print to PDF, then file');
  console.log('Form XIV at copyright.gov.in (₹500 per work).\n');

  return findings.length === 0 ? 0 : 2;
}

if (require.main === module) process.exit(main());

module.exports = { scanFile, orderFiles, walk, SECRET_PATTERNS, LEAD_FILES };
