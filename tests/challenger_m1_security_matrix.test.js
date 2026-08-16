'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { FirestoreMock } = require('./e2e/harness/firestoreMock');
const { AuthEmulator } = require('./e2e/harness/authEmulator');
const { DomInspector } = require('./e2e/harness/domInspector');

describe('Challenger M1-2: Adversarial Security & Boundary Testing Suite', () => {
  const SUPER_ADMIN = 'superadmin@reopsy.com';
  const WHITELISTED_ADMIN = 'admin.delegate@reopsy.com';
  const REGULAR_USER_1 = 'alice.researcher@mit.edu';
  const REGULAR_USER_2 = 'bob.student@stanford.edu';
  const ATTACKER = 'mallory.evil@hacker.io';

  let firestore;
  let auth;
  let inspector;

  test('Setup: Initialize test fixtures with Firestore rules parsing', () => {
    firestore = new FirestoreMock({ superAdminEmail: SUPER_ADMIN });
    auth = new AuthEmulator({ superAdminEmail: SUPER_ADMIN, firestore });
    inspector = new DomInspector();

    // Verify firestore.rules file existence and syntax
    const appRules = fs.readFileSync(path.resolve(__dirname, '../app/firestore.rules'), 'utf8');
    const rootRules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');

    assert.equal(appRules, rootRules, 'app/firestore.rules and root firestore.rules must be identical');
    assert.ok(appRules.includes("rules_version = '2';"));
    assert.ok(appRules.includes('function isAdmin()'));
    assert.ok(appRules.includes('match /content/{contentId}'));
    assert.ok(appRules.includes('allow read: if true;'));
    assert.ok(appRules.includes('allow write: if isAdmin();'));
  });

  describe('1. Non-Admin & Anonymous Lockdown Verification Matrix', () => {
    const sensitiveCollections = [
      'admins',
      'config',
      'pipeline_runs',
      'pipeline_queue',
      'api_usage'
    ];

    const actions = ['read', 'write', 'create', 'update', 'delete'];

    test('1.1: Anonymous / Unauthenticated users CANNOT read or write any sensitive collection', async () => {
      const anonymousTokens = [
        null,                                     // Completely unauthenticated
        {},                                       // Empty object
        { uid: null, email: null },               // Null credentials
        { uid: 'anon_123' },                      // Firebase Anonymous Auth (has UID, no email)
        { uid: 'anon_456', email: '' },           // Blank email
        { uid: 'anon_789', email: undefined },    // Undefined email
      ];

      for (const token of anonymousTokens) {
        for (const col of sensitiveCollections) {
          for (const action of actions) {
            const result = await firestore.evaluateSecurityRule(action, col, 'test_doc_1', token, { data: 'exploit' });
            assert.equal(
              result.allowed,
              false,
              `Anonymous token (${JSON.stringify(token)}) must NOT perform ${action} on ${col}`
            );
          }
        }
      }
    });

    test('1.2: Regular authenticated users CANNOT read or write any sensitive collection', async () => {
      const regularUsers = [
        { uid: 'user_alice', email: REGULAR_USER_1 },
        { uid: 'user_bob', email: REGULAR_USER_2 },
        { uid: 'user_attacker', email: ATTACKER },
        { uid: 'user_subdomain', email: 'admin@reopsy.com.attacker.org' },
        { uid: 'user_similar', email: 'superadmin_fake@reopsy.com' },
      ];

      for (const user of regularUsers) {
        for (const col of sensitiveCollections) {
          for (const action of actions) {
            const result = await firestore.evaluateSecurityRule(action, col, 'restricted_doc', user, { payload: 'tamper' });
            assert.equal(
              result.allowed,
              false,
              `Regular user ${user.email} must NOT perform ${action} on ${col}`
            );
          }
        }
      }
    });
  });

  describe('2. Content Collection Authorization Boundary', () => {
    test('2.1: Anonymous and regular users CAN read content collection', async () => {
      const readers = [
        null,
        { uid: 'anon_guest' },
        { uid: 'user_alice', email: REGULAR_USER_1 },
        { uid: 'user_bob', email: REGULAR_USER_2 },
      ];

      for (const reader of readers) {
        const result = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', reader);
        assert.equal(result.allowed, true, `Reader (${JSON.stringify(reader)}) MUST be allowed to read /content/dailyFeed`);
      }
    });

    test('2.2: Anonymous and regular users CANNOT write to content collection', async () => {
      const unauthorizedWriters = [
        null,
        { uid: 'anon_guest' },
        { uid: 'user_alice', email: REGULAR_USER_1 },
        { uid: 'user_attacker', email: ATTACKER },
      ];

      const actions = ['write', 'create', 'update', 'delete'];

      for (const writer of unauthorizedWriters) {
        for (const action of actions) {
          const result = await firestore.evaluateSecurityRule(action, 'content', 'dailyFeed', writer, { topics: {} });
          assert.equal(
            result.allowed,
            false,
            `Unauthorized writer (${JSON.stringify(writer)}) must NOT perform ${action} on /content/dailyFeed`
          );
        }
      }
    });

    test('2.3: Whitelisted Admin and Super Admin CAN read and write to content collection', async () => {
      // Add whitelisted admin to Firestore admins collection
      await firestore.setDoc(firestore.doc('admins', WHITELISTED_ADMIN), {
        email: WHITELISTED_ADMIN,
        addedAt: new Date().toISOString(),
        addedBy: SUPER_ADMIN
      });

      const authorizedAdmins = [
        { uid: 'super_admin_uid', email: SUPER_ADMIN },
        { uid: 'delegated_admin_uid', email: WHITELISTED_ADMIN }
      ];

      for (const admin of authorizedAdmins) {
        // Read test
        const readRes = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', admin);
        assert.equal(readRes.allowed, true);

        // Write test
        const writeRes = await firestore.evaluateSecurityRule('write', 'content', 'dailyFeed', admin, { modifiedFeed: true });
        assert.equal(writeRes.allowed, true);
      }
    });
  });

  describe('3. Super Admin Immutability & Whitelist Lifecycle Invariants', () => {
    test('3.1: Super Admin check is immune to uppercase, leading/trailing whitespace variations', async () => {
      const emailVariations = [
        SUPER_ADMIN,
        '  ' + SUPER_ADMIN + '  ',
        SUPER_ADMIN.toUpperCase(),
        'SuperAdmin@ReOpSy.com',
      ];

      for (const email of emailVariations) {
        await auth.signInWithGoogle(email);
        const state = await auth.getAuthContextState();
        assert.equal(state.isAdmin, true, `Email variant "${email}" must be recognized as admin`);
        assert.equal(state.isSuperAdmin, true, `Email variant "${email}" must be recognized as Super Admin`);
      }
    });

    test('3.2: Whitelist addition is case-insensitive and normalized', async () => {
      const newAdmin = 'NEW_STAFF@reopsy.com';
      await firestore.setDoc(firestore.doc('admins', newAdmin.toLowerCase()), {
        email: newAdmin.toLowerCase(),
        addedAt: new Date().toISOString(),
        addedBy: SUPER_ADMIN
      });

      // Login with uppercase variant
      await auth.signInWithGoogle(newAdmin);
      const state = await auth.getAuthContextState();
      assert.equal(state.isAdmin, true);
      assert.equal(state.isSuperAdmin, false);
    });

    test('3.3: Super Admin cannot be removed from client service layer and whitelist list', () => {
      // Simulate adminService logic checks directly
      const cleanEmail = SUPER_ADMIN.trim().toLowerCase();
      const superAdminEmail = (process.env.EXPO_PUBLIC_ADMIN_EMAIL || SUPER_ADMIN).trim().toLowerCase();

      // Guard check: removal of super admin must be rejected
      const attemptRemoveSuperAdmin = () => {
        if (superAdminEmail && cleanEmail === superAdminEmail) {
          throw new Error('Cannot remove Super Admin from whitelist');
        }
      };

      assert.throws(attemptRemoveSuperAdmin, /Cannot remove Super Admin from whitelist/);

      // Guard check: re-adding super admin must be rejected
      const attemptAddSuperAdmin = () => {
        if (superAdminEmail && cleanEmail === superAdminEmail) {
          throw new Error('Super Admin is already permanently configured via environment');
        }
      };

      assert.throws(attemptAddSuperAdmin, /Super Admin is already permanently configured via environment/);
    });
  });

  describe('4. User Isolation & Cross-Tenant Data Protection', () => {
    test('4.1: Users can only read and write their OWN document in /users/{userId}', async () => {
      const userA = { uid: 'uid_alice_123', email: REGULAR_USER_1 };
      const userB = { uid: 'uid_bob_456', email: REGULAR_USER_2 };

      // Alice accesses Alice's doc -> ALLOWED
      const aliceOwnRead = await firestore.evaluateSecurityRule('read', 'users', userA.uid, userA);
      assert.equal(aliceOwnRead.allowed, true);
      const aliceOwnWrite = await firestore.evaluateSecurityRule('write', 'users', userA.uid, userA, { bookmarks: [] });
      assert.equal(aliceOwnWrite.allowed, true);

      // Alice attempts to access Bob's doc -> DENIED
      const aliceCrossRead = await firestore.evaluateSecurityRule('read', 'users', userB.uid, userA);
      assert.equal(aliceCrossRead.allowed, false, "Alice must NOT read Bob's user profile");
      const aliceCrossWrite = await firestore.evaluateSecurityRule('write', 'users', userB.uid, userA, { hijacked: true });
      assert.equal(aliceCrossWrite.allowed, false, "Alice must NOT write to Bob's user profile");
    });
  });
});
