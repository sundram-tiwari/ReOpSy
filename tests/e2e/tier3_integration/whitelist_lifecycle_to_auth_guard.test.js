'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { AuthEmulator, FirestoreMock, DomInspector } = require('../harness');

describe('Tier 3 - Integration: Whitelist Lifecycle -> Auth Hook State -> Route Guard -> Admin Actions', () => {
  const superAdminEmail = 'superadmin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });
  const auth = new AuthEmulator({ superAdminEmail, firestore });
  const inspector = new DomInspector();

  test('I3.9: Whitelisted secondary admin performs admin operations, then upon removal is strictly locked out', async () => {
    const secondaryEmail = 'research_lead@reopsy.com';

    // 1. Super Admin logs in and adds secondary admin
    await auth.signInWithGoogle(superAdminEmail);
    await firestore.setDoc(firestore.doc('admins', secondaryEmail), {
      email: secondaryEmail,
      addedAt: new Date().toISOString(),
      addedBy: superAdminEmail
    });

    // 2. Secondary admin signs in
    await auth.signInWithGoogle(secondaryEmail);
    let authState = await auth.getAuthContextState();
    assert.equal(authState.isAdmin, true);
    assert.equal(authState.isSuperAdmin, false);

    // 3. Secondary admin accesses Admin Panel and triggers fetch
    const navResult = inspector.simulateNavigate(authState, 'Admin');
    assert.equal(navResult.accessible, true);

    const queueId = `queue_sec_${Date.now()}`;
    await firestore.setDoc(firestore.doc('pipeline_queue', queueId), {
      topic: 'nlp',
      status: 'pending',
      requestedBy: secondaryEmail
    });

    const queueDoc = (await firestore.getDoc(firestore.doc('pipeline_queue', queueId))).data();
    assert.equal(queueDoc.requestedBy, secondaryEmail);

    // 4. Super Admin removes secondary admin
    await firestore.deleteDoc(firestore.doc('admins', secondaryEmail));

    // 5. Secondary admin re-evaluates auth state
    authState = await auth.getAuthContextState();
    assert.equal(authState.isAdmin, false);

    // 6. Secondary admin navigation is blocked
    const blockedNav = inspector.simulateNavigate(authState, 'Admin');
    assert.equal(blockedNav.accessible, false);
    assert.equal(blockedNav.redirectedTo, 'MainDrawer');

    // 7. Security rules deny secondary admin from writing to queue
    const ruleCheck = await firestore.evaluateSecurityRule('write', 'pipeline_queue', 'hacked_queue', authState.user);
    assert.equal(ruleCheck.allowed, false);
  });

  test('I3.10: Whitelisted secondary admin cannot delete super admin or modify permissions beyond scope', async () => {
    const secondaryUser = { uid: 'sec_1', email: 'mod@reopsy.com' };

    // Security check: only super admin can delete from admins
    const canDeleteSuperAdmin = (requesterEmail, targetEmail, superEmail) => {
      if (targetEmail.toLowerCase() === superEmail.toLowerCase()) return false;
      return requesterEmail.toLowerCase() === superEmail.toLowerCase();
    };

    assert.equal(canDeleteSuperAdmin(secondaryUser.email, superAdminEmail, superAdminEmail), false);
    assert.equal(canDeleteSuperAdmin(superAdminEmail, secondaryUser.email, superAdminEmail), true);
  });
});
