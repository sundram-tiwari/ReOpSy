'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { FirestoreMock } = require('../harness');

describe('Tier 2 - Boundary: F2 Firestore Security Rules', () => {
  const superAdmin = { uid: 'uid-admin', email: 'admin@reopsy.com' };
  const regularUser = { uid: 'uid-user', email: 'user@gmail.com' };
  const firestore = new FirestoreMock({ superAdminEmail: superAdmin.email });

  test('B2.1: Path traversal attempts in document IDs are rejected safely', async () => {
    const maliciousDocIds = ['../config/system_prompt', '..%2F..%2Fadmins', 'admins/nested/bad'];
    for (const docId of maliciousDocIds) {
      const res = await firestore.evaluateSecurityRule('read', 'users', docId, regularUser);
      assert.equal(res.allowed, false, `Path traversal in docId ${docId} must be denied`);
    }
  });

  test('B2.2: Token forgery with spoofed email but missing/invalid UID is rejected', async () => {
    const spoofedUserNoUid = { email: 'admin@reopsy.com', uid: null };
    const res = await firestore.evaluateSecurityRule('write', 'config', 'system_prompt', spoofedUserNoUid, { prompt: 'hacked' });
    assert.equal(res.allowed, false, 'User without valid UID must be rejected');
  });

  test('B2.3: Extremely large payload sizes (>1MB) validation simulation', async () => {
    const hugePayload = {
      prompt: 'A'.repeat(1024 * 1024 + 100) // > 1MB
    };

    const validatePayloadSize = (payload) => {
      const bytes = Buffer.byteLength(JSON.stringify(payload));
      return bytes <= 1048576; // 1MB limit
    };

    assert.equal(validatePayloadSize(hugePayload), false, 'Payload > 1MB must exceed size limit');
  });

  test('B2.4: Concurrent write requests from admin and non-admin evaluate independently without cross-leak', async () => {
    const promises = [
      firestore.evaluateSecurityRule('write', 'config', 'system_prompt', superAdmin, { prompt: 'Valid' }),
      firestore.evaluateSecurityRule('write', 'config', 'system_prompt', regularUser, { prompt: 'Invalid' }),
      firestore.evaluateSecurityRule('write', 'pipeline_queue', 'q1', superAdmin, { topic: 'llm' }),
      firestore.evaluateSecurityRule('write', 'pipeline_queue', 'q2', regularUser, { topic: 'llm' })
    ];

    const results = await Promise.all(promises);
    assert.equal(results[0].allowed, true);
    assert.equal(results[1].allowed, false);
    assert.equal(results[2].allowed, true);
    assert.equal(results[3].allowed, false);
  });

  test('B2.5: Security rule evaluation with undefined or unknown collections defaults to deny', async () => {
    const unknownCollections = ['secret_keys', 'internal_logs', 'billing', ''];
    for (const col of unknownCollections) {
      const res = await firestore.evaluateSecurityRule('read', col, 'doc1', regularUser);
      assert.equal(res.allowed, false, `Access to collection '${col}' must default to denied`);
    }
  });
});
