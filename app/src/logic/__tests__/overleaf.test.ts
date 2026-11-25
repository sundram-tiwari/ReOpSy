import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LibraryEntry } from '../../types';
import { EMPTY_MATRIX } from '../exporters';
import { buildSurveyTex, MAX_OVERLEAF_FRAGMENT, nativeOverleafUrl } from '../overleaf';

test('native hand-off transmits UTF-8 privately in the URL fragment', () => {
  const tex = '% fixture न & 90%\n\\documentclass{article}';
  const url = new URL(nativeOverleafUrl('https://reopsy.example/app/?q=discard#discard', tex));
  assert.equal(url.origin + url.pathname + url.search, 'https://reopsy.example/app/overleaf.html');
  assert.equal(Buffer.from(url.hash.slice(1), 'base64url').toString('utf8'), tex);
  assert.match(url.hash, /^#[A-Za-z0-9_-]+$/);
});

test('native hand-off rejects non-HTTPS destinations, URL credentials and oversized text', () => {
  assert.throws(() => nativeOverleafUrl('http://reopsy.example/', 'hello'), /HTTPS/);
  assert.throws(() => nativeOverleafUrl('https://a:b@reopsy.example/', 'hello'), /HTTPS/);
  assert.throws(() => nativeOverleafUrl('https://reopsy.example/', 'a'.repeat(MAX_OVERLEAF_FRAGMENT)), /Download LaTeX/);
  assert.ok(nativeOverleafUrl('https://reopsy.example', 'a'.repeat(MAX_OVERLEAF_FRAGMENT * 3 / 4)).endsWith('YWFh'));
});
const fixtureEntry = {
  status: 'survey', addedOn: '2026-11-25', note: 'NOTE_SENTINEL',
  paper: { id: 'x', originalTitle: 'Public paper title', authors: ['Source Author'], source: 'arxiv', year: 2026,
    url: 'https://example.org/public', topics: [], likes: 0, catchyTitle: '', summary: '', venue: null, pdfUrl: null,
    matrixRow: { ...EMPTY_MATRIX, result: 'SOURCE_MATRIX_SENTINEL' } },
} satisfies LibraryEntry;

test('references-only TeX omits private notes and both matrix sources; keeps public citation author', () => {
  for (const entry of [fixtureEntry, { ...fixtureEntry, matrix: { ...EMPTY_MATRIX, result: 'EDITED_MATRIX_SENTINEL' } }]) {
    const tex = buildSurveyTex([entry], { title: 'Neutral title', workingMaterial: false });
    assert.ok(!tex.includes('SENTINEL'));
    assert.ok(!tex.includes('\\begin{tabularx}'));
    assert.ok(tex.includes('Source Author'));
    assert.ok(tex.includes('\\author{}'));
    assert.ok(tex.includes('Neutral title'));
  }
});
test('opted-in full TeX includes working material, optional author escaped independently', () => {
  const tex = buildSurveyTex([fixtureEntry], { title: 'Draft', author: ' Alias & Co ', workingMaterial: true });
  assert.ok(tex.includes('NOTE_SENTINEL'));
  assert.ok(tex.includes('SOURCE\\_MATRIX\\_SENTINEL'));
  assert.ok(tex.includes('\\author{Alias \\& Co}'));
});
