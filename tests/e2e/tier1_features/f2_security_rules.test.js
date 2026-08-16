'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 1 - Feature F2: Firestore Security Rules', () => {
  const superAdmin = { uid: 'uid-super', email: 'admin@reopsy.com' };
  const whitelistedAdmin = { uid: 'uid-white', email: 'mod@reopsy.com' };
  const regularUser = { uid: 'uid-user1', email: 'regular@gmail.com' };
  const unauthenticated = null;

  const firestore = new FirestoreMock({ superAdminEmail: superAdmin.email });

  test('F2.1: Admins collection allows read/write for admins, denies non-admins and unauthenticated', async () => {
    // Seed whitelist
    await firestore.setDoc(firestore.doc('admins', whitelistedAdmin.email), {
      email: whitelistedAdmin.email,
      addedAt: new Date().toISOString(),
      addedBy: superAdmin.email
    });

    // Super Admin check
    let res = await firestore.evaluateSecurityRule('write', 'admins', 'newadmin@reopsy.com', superAdmin, { email: 'newadmin@reopsy.com' });
    assert.equal(res.allowed, true, 'Super Admin should be allowed write to admins');

    // Whitelisted Admin check
    res = await firestore.evaluateSecurityRule('read', 'admins', whitelistedAdmin.email, whitelistedAdmin);
    assert.equal(res.allowed, true, 'Whitelisted Admin should be allowed read from admins');

    // Regular User check
    res = await firestore.evaluateSecurityRule('read', 'admins', 'someadmin@reopsy.com', regularUser);
    assert.equal(res.allowed, false, 'Regular user should be denied read from admins');

    res = await firestore.evaluateSecurityRule('write', 'admins', 'hacked@reopsy.com', regularUser, { email: 'hacked@reopsy.com' });
    assert.equal(res.allowed, false, 'Regular user should be denied write to admins');

    // Unauthenticated check
    res = await firestore.evaluateSecurityRule('read', 'admins', 'someadmin@reopsy.com', unauthenticated);
    assert.equal(res.allowed, false, 'Unauthenticated user should be denied read from admins');
  });

  test('F2.2: Config collection allows read and write exclusively to authenticated admins', async () => {
    // Admin write
    let res = await firestore.evaluateSecurityRule('write', 'config', 'system_prompt', superAdmin, { prompt: 'Custom prompt' });
    assert.equal(res.allowed, true);

    // Admin read
    res = await firestore.evaluateSecurityRule('read', 'config', 'system_prompt', whitelistedAdmin);
    assert.equal(res.allowed, true);

    // Regular user write
    res = await firestore.evaluateSecurityRule('write', 'config', 'system_prompt', regularUser, { prompt: 'Malicious prompt' });
    assert.equal(res.allowed, false);

    // Regular user read
    res = await firestore.evaluateSecurityRule('read', 'config', 'system_prompt', regularUser);
    assert.equal(res.allowed, false);
  });

  test('F2.3: Pipeline runs and pipeline queue collections restrict access to authenticated admins', async () => {
    // Pipeline queue write by admin
    let res = await firestore.evaluateSecurityRule('write', 'pipeline_queue', 'queue_1', superAdmin, { topic: 'llm', status: 'pending' });
    assert.equal(res.allowed, true);

    // Pipeline runs read by admin
    res = await firestore.evaluateSecurityRule('read', 'pipeline_runs', 'run_123', whitelistedAdmin);
    assert.equal(res.allowed, true);

    // Regular user denied queue write
    res = await firestore.evaluateSecurityRule('write', 'pipeline_queue', 'queue_fake', regularUser, { topic: 'llm' });
    assert.equal(res.allowed, false);

    // Regular user denied runs read
    res = await firestore.evaluateSecurityRule('read', 'pipeline_runs', 'run_123', regularUser);
    assert.equal(res.allowed, false);
  });

  test('F2.4: API usage collection allows read and write only to authenticated admins', async () => {
    const usageDoc = { provider: 'Gemini', success: true, timestamp: new Date().toISOString() };

    let res = await firestore.evaluateSecurityRule('write', 'api_usage', 'usage_1', superAdmin, usageDoc);
    assert.equal(res.allowed, true);

    res = await firestore.evaluateSecurityRule('read', 'api_usage', 'usage_1', whitelistedAdmin);
    assert.equal(res.allowed, true);

    res = await firestore.evaluateSecurityRule('read', 'api_usage', 'usage_1', regularUser);
    assert.equal(res.allowed, false);

    res = await firestore.evaluateSecurityRule('write', 'api_usage', 'usage_2', unauthenticated, usageDoc);
    assert.equal(res.allowed, false);
  });

  test('F2.5: Content collection allows public read-only access but restricts writes to admins', async () => {
    // Unauthenticated user can read content
    let res = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', unauthenticated);
    assert.equal(res.allowed, true, 'Content should have public read access');

    // Regular user can read content
    res = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', regularUser);
    assert.equal(res.allowed, true);

    // Regular user cannot write content
    res = await firestore.evaluateSecurityRule('write', 'content', 'dailyFeed', regularUser, { updatedBy: 'user' });
    assert.equal(res.allowed, false, 'Non-admin must be denied write to content');

    // Admin can write content
    res = await firestore.evaluateSecurityRule('write', 'content', 'dailyFeed', superAdmin, { updatedBy: superAdmin.email });
    assert.equal(res.allowed, true, 'Admin must be allowed write to content');
  });

  test('F2.6: Users collection enforces strict owner-only access (uid match)', async () => {
    // User reading own record
    let res = await firestore.evaluateSecurityRule('read', 'users', 'uid-user1', regularUser);
    assert.equal(res.allowed, true, 'User must access own document');

    // User trying to read another user's record
    res = await firestore.evaluateSecurityRule('read', 'users', 'uid-user2', regularUser);
    assert.equal(res.allowed, false, 'User must not access another user document');

    // Unauthenticated access
    res = await firestore.evaluateSecurityRule('read', 'users', 'uid-user1', unauthenticated);
    assert.equal(res.allowed, false, 'Unauthenticated user denied access to users');
  });
});
