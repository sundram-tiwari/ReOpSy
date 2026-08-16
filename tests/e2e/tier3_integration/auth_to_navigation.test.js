'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { AuthEmulator, FirestoreMock, DomInspector } = require('../harness');

describe('Tier 3 - Integration: Auth to Navigation & Route Guard', () => {
  const superAdminEmail = 'superadmin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });
  const auth = new AuthEmulator({ superAdminEmail, firestore });
  const inspector = new DomInspector();

  test('I3.1: Super Admin login grants drawer item and direct route access; logout clears both immediately', async () => {
    // 1. Log in
    await auth.signInWithGoogle(superAdminEmail);
    const authState = await auth.getAuthContextState();
    assert.equal(authState.isAdmin, true);

    // 2. Drawer render check
    const drawerRender = inspector.simulateDrawerRender(authState);
    assert.ok(drawerRender.visibleItems.includes('Mission Control'));
    assert.ok(drawerRender.icons.includes('shield'));

    // 3. Navigation guard check
    const navResult = inspector.simulateNavigate(authState, 'Admin');
    assert.equal(navResult.accessible, true);
    assert.equal(navResult.renderedScreen, 'AdminScreen');

    // 4. Log out
    await auth.signOut();
    const loggedOutState = await auth.getAuthContextState();
    assert.equal(loggedOutState.isAdmin, false);

    // 5. Zero-DOM check on logged out state
    const loggedOutRender = inspector.simulateDrawerRender(loggedOutState);
    const audit = inspector.auditZeroDomLeakage(loggedOutRender.domString);
    assert.equal(audit.hasAdminLeak, false);

    // 6. Navigation guard blocks access
    const blockedNav = inspector.simulateNavigate(loggedOutState, 'Admin');
    assert.equal(blockedNav.accessible, false);
    assert.equal(blockedNav.redirectedTo, 'MainDrawer');
  });

  test('I3.2: Whitelist addition and revocation reflects dynamically on navigation access across sessions', async () => {
    const editorEmail = 'editor_temp@reopsy.com';

    // 1. Initial login - regular user, no admin access
    await auth.signInWithGoogle(editorEmail);
    let state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, false);
    assert.equal(inspector.simulateDrawerRender(state).visibleItems.includes('Mission Control'), false);

    // 2. Super Admin adds editor to Firestore admins collection
    await firestore.setDoc(firestore.doc('admins', editorEmail), {
      email: editorEmail,
      addedAt: new Date().toISOString(),
      addedBy: superAdminEmail
    });

    // 3. Editor refreshes / re-checks auth state
    state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, true);
    assert.equal(inspector.simulateDrawerRender(state).visibleItems.includes('Mission Control'), true);
    assert.equal(inspector.simulateNavigate(state, 'Admin').accessible, true);

    // 4. Super Admin revokes editor
    await firestore.deleteDoc(firestore.doc('admins', editorEmail));

    // 5. Next session check
    state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, false);
    assert.equal(inspector.simulateDrawerRender(state).visibleItems.includes('Mission Control'), false);
    assert.equal(inspector.simulateNavigate(state, 'Admin').accessible, false);
  });
});
