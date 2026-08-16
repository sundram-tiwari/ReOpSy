'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { AuthEmulator, FirestoreMock, DomInspector } = require('../harness');

describe('Tier 4 - Scenario 2: Non-Admin Complete Isolation & Zero-DOM Leakage Journey', () => {
  const superAdminEmail = 'superadmin@reopsy.com';
  const regularUserEmail = 'student.researcher@university.edu';

  const firestore = new FirestoreMock({ superAdminEmail });
  const auth = new AuthEmulator({ superAdminEmail, firestore });
  const inspector = new DomInspector();

  test('Scenario 2: Complete isolation of regular non-admin user across DOM, navigation, and database access', async () => {
    // Step 1: Regular user signs in via Google
    await auth.signInWithGoogle(regularUserEmail, 'Student User');
    const authState = await auth.getAuthContextState();

    assert.equal(authState.user.email, regularUserEmail);
    assert.equal(authState.isAdmin, false);
    assert.equal(authState.isSuperAdmin, false);

    // Step 2: Render drawer and perform strict zero-DOM audit
    const drawerRender = inspector.simulateDrawerRender(authState);
    const audit = inspector.auditZeroDomLeakage(drawerRender.domString);

    assert.equal(audit.hasAdminLeak, false, 'Zero admin leaks allowed in DOM');
    assert.equal(drawerRender.visibleItems.includes('Mission Control'), false);
    assert.equal(drawerRender.icons.includes('shield'), false);

    // Step 3: Regular user attempts direct URL manipulation / deep-link navigation to 'Admin'
    const adminNavAttempt = inspector.simulateNavigate(authState, 'Admin');
    assert.equal(adminNavAttempt.accessible, false, 'Direct navigation to Admin route must be rejected');
    assert.equal(adminNavAttempt.redirectedTo, 'MainDrawer', 'Unauthorized direct navigation should redirect to MainDrawer');

    // Step 4: Regular user queries Firestore restricted collections directly -> All operations denied by rules
    const collectionsToTest = ['admins', 'config', 'pipeline_runs', 'pipeline_queue', 'api_usage'];
    for (const col of collectionsToTest) {
      const readAttempt = await firestore.evaluateSecurityRule('read', col, 'any_doc', authState.user);
      assert.equal(readAttempt.allowed, false, `Read access to ${col} must be denied to regular user`);

      const writeAttempt = await firestore.evaluateSecurityRule('write', col, 'any_doc', authState.user, { test: 'data' });
      assert.equal(writeAttempt.allowed, false, `Write access to ${col} must be denied to regular user`);
    }

    // Step 5: Regular user retains full access to public feed and private user settings
    const publicContentRead = await firestore.evaluateSecurityRule('read', 'content', 'dailyFeed', authState.user);
    assert.equal(publicContentRead.allowed, true);

    const userProfileRead = await firestore.evaluateSecurityRule('read', 'users', authState.user.uid, authState.user);
    assert.equal(userProfileRead.allowed, true);
  });
});
