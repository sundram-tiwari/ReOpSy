'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { AuthEmulator, FirestoreMock } = require('../harness');

describe('Tier 1 - Feature F1: Admin Auth & Dynamic Whitelist', () => {
  const superAdminEmail = 'superadmin@reopsy.com';
  const firestore = new FirestoreMock({ superAdminEmail });
  const auth = new AuthEmulator({ superAdminEmail, firestore });

  test('F1.1: Super Admin login via EXPO_PUBLIC_ADMIN_EMAIL sets isAdmin = true and isSuperAdmin = true', async () => {
    await auth.signInWithGoogle(superAdminEmail, 'Super Admin User');
    const state = await auth.getAuthContextState();

    assert.equal(state.user.email, superAdminEmail);
    assert.equal(state.isAdmin, true, 'Super admin must have isAdmin === true');
    assert.equal(state.isSuperAdmin, true, 'Super admin must have isSuperAdmin === true');
  });

  test('F1.2: Whitelisted email in Firestore admins collection grants isAdmin = true and isSuperAdmin = false', async () => {
    const secondaryAdminEmail = 'colleague@reopsy.com';
    // Add colleague to Firestore admins collection
    await firestore.setDoc(firestore.doc('admins', secondaryAdminEmail), {
      email: secondaryAdminEmail,
      addedAt: new Date().toISOString(),
      addedBy: superAdminEmail
    });

    await auth.signInWithGoogle(secondaryAdminEmail, 'Colleague Admin');
    const state = await auth.getAuthContextState();

    assert.equal(state.user.email, secondaryAdminEmail);
    assert.equal(state.isAdmin, true, 'Whitelisted user must have isAdmin === true');
    assert.equal(state.isSuperAdmin, false, 'Whitelisted user must NOT have isSuperAdmin === true');
  });

  test('F1.3: Non-whitelisted user receives isAdmin = false and isSuperAdmin = false', async () => {
    const regularUserEmail = 'regular.user@gmail.com';
    await auth.signInWithGoogle(regularUserEmail, 'Regular User');
    const state = await auth.getAuthContextState();

    assert.equal(state.user.email, regularUserEmail);
    assert.equal(state.isAdmin, false, 'Regular user must have isAdmin === false');
    assert.equal(state.isSuperAdmin, false, 'Regular user must have isSuperAdmin === false');
  });

  test('F1.4: Unauthenticated user (null user) receives isAdmin = false and isSuperAdmin = false', async () => {
    await auth.signOut();
    const state = await auth.getAuthContextState();

    assert.equal(state.user, null);
    assert.equal(state.isAdmin, false, 'Unauthenticated session must have isAdmin === false');
    assert.equal(state.isSuperAdmin, false, 'Unauthenticated session must have isSuperAdmin === false');
  });

  test('F1.5: Email matching is case-insensitive for both Super Admin and Firestore whitelisted admins', async () => {
    // Test uppercase super admin email
    await auth.signInWithGoogle('SUPERADMIN@REOPSY.COM', 'Uppercase Super Admin');
    let state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, true, 'Uppercase super admin must be recognized');
    assert.equal(state.isSuperAdmin, true, 'Uppercase super admin must have isSuperAdmin === true');

    // Test mixed-case whitelisted email
    await auth.signInWithGoogle('Colleague@ReOpSy.com', 'MixedCase Colleague');
    state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, true, 'Mixed-case whitelisted admin must be recognized');
    assert.equal(state.isSuperAdmin, false);
  });

  test('F1.6: Auth state transitions (login, switch account, logout) correctly recompute admin privileges', async () => {
    // 1. Start unauthenticated
    await auth.signOut();
    let state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, false);

    // 2. Sign in as super admin
    await auth.signInWithGoogle(superAdminEmail);
    state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, true);

    // 3. Switch to regular user
    await auth.signInWithGoogle('visitor@example.com');
    state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, false);

    // 4. Sign out
    await auth.signOut();
    state = await auth.getAuthContextState();
    assert.equal(state.isAdmin, false);
  });
});
