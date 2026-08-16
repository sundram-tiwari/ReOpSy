'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { AuthEmulator, FirestoreMock, DomInspector } = require('../harness');

describe('Tier 4 - Scenario 1: Super Admin Complete Onboarding & Whitelisting Journey', () => {
  const superAdminEmail = 'superadmin@reopsy.com';
  const secondaryAdminEmail = 'colleague@reopsy.com';

  const firestore = new FirestoreMock({ superAdminEmail });
  const auth = new AuthEmulator({ superAdminEmail, firestore });
  const inspector = new DomInspector();

  test('Scenario 1: Full lifecycle of Super Admin onboarding a secondary admin and verifying collaborative access', async () => {
    // Step 1: Super Admin launches app and signs in via Google
    await auth.signInWithGoogle(superAdminEmail, 'Chief Administrator');
    const superState = await auth.getAuthContextState();

    assert.equal(superState.user.email, superAdminEmail);
    assert.equal(superState.isAdmin, true);
    assert.equal(superState.isSuperAdmin, true);

    // Step 2: Super Admin opens drawer navigation and clicks "Mission Control"
    const superDrawer = inspector.simulateDrawerRender(superState);
    assert.ok(superDrawer.visibleItems.includes('Mission Control'));
    assert.ok(superDrawer.icons.includes('shield'));

    const navResult = inspector.simulateNavigate(superState, 'Admin');
    assert.equal(navResult.accessible, true);
    assert.equal(navResult.renderedScreen, 'AdminScreen');

    // Step 3: Super Admin switches to Settings & Config tab and enters colleague email into whitelist
    const newAdminDocRef = firestore.doc('admins', secondaryAdminEmail);
    await firestore.setDoc(newAdminDocRef, {
      email: secondaryAdminEmail,
      addedAt: new Date().toISOString(),
      addedBy: superAdminEmail
    });

    // Step 4: Verify whitelist reflects the new admin
    const whitelistDocs = await firestore.getDocs(firestore.collection('admins'));
    assert.ok(whitelistDocs.docs.some(d => d.data().email === secondaryAdminEmail));

    // Step 5: Super Admin signs out
    await auth.signOut();
    const unauthState = await auth.getAuthContextState();
    assert.equal(unauthState.isAdmin, false);

    // Step 6: Secondary Admin signs in for the first time
    await auth.signInWithGoogle(secondaryAdminEmail, 'Colleague Researcher');
    const colleagueState = await auth.getAuthContextState();

    assert.equal(colleagueState.user.email, secondaryAdminEmail);
    assert.equal(colleagueState.isAdmin, true, 'Colleague should have isAdmin === true');
    assert.equal(colleagueState.isSuperAdmin, false, 'Colleague should have isSuperAdmin === false');

    // Step 7: Secondary Admin sees "Mission Control" in drawer and navigates into Admin panel
    const colleagueDrawer = inspector.simulateDrawerRender(colleagueState);
    assert.ok(colleagueDrawer.visibleItems.includes('Mission Control'));
    assert.ok(colleagueDrawer.icons.includes('shield'));

    const colleagueNav = inspector.simulateNavigate(colleagueState, 'Admin');
    assert.equal(colleagueNav.accessible, true);
    assert.equal(colleagueNav.renderedScreen, 'AdminScreen');
  });
});
