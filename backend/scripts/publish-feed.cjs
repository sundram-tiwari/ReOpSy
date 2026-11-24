'use strict';
const fs = require('node:fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { ALL_SLUGS } = require('../ingest/lib/topics');

async function main() {
  const expectedProject = process.env.REOPSY_FIRESTORE_PROJECT_ID?.trim();
  if (!expectedProject) throw new Error('Configure the expected Firebase project ID before publishing.');
  let account;
  try {
    account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  } catch {
    throw new Error('Firebase service account is missing or invalid.');
  }
  if (account?.project_id !== expectedProject) {
    throw new Error('Firebase service account does not match the expected project.');
  }
  let adminDb;
  try {
    adminDb = getFirestore(initializeApp({ projectId: expectedProject, credential: cert(account) }));
  } catch {
    throw new Error('Firebase service account is missing or invalid.');
  }
  const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const generatedAt = new Date(payload.generatedAt);
  const now = Date.now();
  if (!Number.isFinite(generatedAt.getTime()) || generatedAt.getTime() > now || now - generatedAt.getTime() > 12 * 3600_000) {
    throw new Error('Refusing to publish an invalid or stale feed snapshot.');
  }
  if (!payload.topics || !ALL_SLUGS.every((slug) => Array.isArray(payload.topics[slug]))) throw new Error('Incomplete topic snapshot.');
  for (const [slug, rows] of Object.entries(payload.topics)) {
    if (!ALL_SLUGS.includes(slug) || rows.length > 12 || rows.some((p) => !p?.id || !p.published || !/^https?:\/\//i.test(p.url))) {
      throw new Error('Feed snapshot failed paper validation.');
    }
  }
  const total = Object.values(payload.topics).flat().length;
  if (!total || Buffer.byteLength(JSON.stringify(payload)) > 800_000) throw new Error('Feed snapshot empty or too large.');
  const ref = adminDb.collection('feeds').doc('latest');
  const written = await adminDb.runTransaction(async (transaction) => {
    const prior = await transaction.get(ref);
    const previous = Date.parse(prior.data()?.generatedAt || '');
    if (Number.isFinite(previous) && previous >= generatedAt.getTime()) return false;
    transaction.set(ref, payload);
    return true;
  });
  console.log(written ? `Published ${total} topic-paper entries to feeds/latest` : 'Skipped: an equal or newer feed is already live.');
}

main().catch((error) => { console.error('Feed publish failed:', error.code || (/^(Firebase service account|Configure the expected Firebase project)/.test(String(error.message)) ? error.message : 'see snapshot validation or service permissions')); process.exitCode = 1; });
