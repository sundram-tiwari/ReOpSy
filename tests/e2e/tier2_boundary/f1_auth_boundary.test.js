'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { AuthEmulator, FirestoreMock } = require('../harness');

describe('Tier 2 - Boundary: F1 Admin Auth & Dynamic Whitelist', () => {
  test('B1.1: Missing or undefined EXPO_PUBLIC_ADMIN_EMAIL handles gracefully without crashing', async () => {
    const auth = new AuthEmulator({ superAdminEmail: '' });
    await auth.signInWithGoogle('anyone@example.com');
    const state = await auth.getAuthContextState();

    assert.equal(state.isAdmin, false);
    assert.equal(state.isSuperAdmin, false);
  });

  test('B1.2: Leading/trailing whitespace around admin emails is stripped', async () => {
    const firestore = new FirestoreMock({ superAdminEmail: 'super@reopsy.com' });
    const auth = new AuthEmulator({ superAdminEmail: 'super@reopsy.com', firestore });

    await auth.signInWithGoogle('   super@reopsy.com   ');
    const state = await auth.getAuthContextState();

    assert.equal(state.isAdmin, true);
    assert.equal(state.isSuperAdmin, true);
  });

  test('B1.3: Offline / network error during Firestore whitelist check falls back to super admin check', async () => {
    const faultyFirestore = {
      getDoc: async () => { throw new Error('Network timeout: Firestore unreachable'); },
      getDocs: async () => { throw new Error('Network timeout: Firestore unreachable'); },
      doc: () => ({})
    };

    const auth = new AuthEmulator({ superAdminEmail: 'super@reopsy.com', firestore: faultyFirestore });

    // Super admin still succeeds despite Firestore outage
    await auth.signInWithGoogle('super@reopsy.com');
    let state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, true);
    assert.equal(state.isSuperAdmin, true);

    // Regular user fails safely to non-admin
    await auth.signInWithGoogle('other@reopsy.com');
    state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, false);
    assert.equal(state.isSuperAdmin, false);
  });

  test('B1.4: Malformed user objects (null email, empty string) evaluate to non-admin', async () => {
    const auth = new AuthEmulator({ superAdminEmail: 'super@reopsy.com' });

    let status = await auth.resolveAdminStatus(null);
    assert.equal(status.isAdmin, false);

    status = await auth.resolveAdminStatus({ email: '' });
    assert.equal(status.isAdmin, false);

    status = await auth.resolveAdminStatus({ email: '   ' });
    assert.equal(status.isAdmin, false);
  });

  test('B1.5: Rapid consecutive auth state toggles resolve cleanly without race conditions', async () => {
    const firestore = new FirestoreMock({ superAdminEmail: 'super@reopsy.com' });
    const auth = new AuthEmulator({ superAdminEmail: 'super@reopsy.com', firestore });

    const emails = [
      'user1@example.com',
      'super@reopsy.com',
      'user2@example.com',
      'super@reopsy.com',
      'user3@example.com'
    ];

    for (const email of emails) {
      await auth.signInWithGoogle(email);
      const state = await auth.getAuthContextState();
      const expectedAdmin = email === 'super@reopsy.com';
      assert.equal(state.isAdmin, expectedAdmin, `Expected isAdmin=${expectedAdmin} for ${email}`);
    }
  });
});
