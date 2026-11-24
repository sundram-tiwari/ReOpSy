import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_OVERLEAF_FRAGMENT, nativeOverleafUrl } from '../overleaf';

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
