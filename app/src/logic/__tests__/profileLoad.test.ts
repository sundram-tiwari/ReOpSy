import assert from 'node:assert/strict';
import test from 'node:test';
import { canKeepVerifiedProfile, classifyProfileLoadError, profileLoadMessage } from '../profileLoad';

test('profile load distinguishes backend access, login, reachability and configuration failures', () => {
  assert.equal(classifyProfileLoadError({ code: 'firestore/permission-denied' }), 'permission-denied');
  assert.match(profileLoadMessage('permission-denied'), /server denied access/);
  assert.equal(classifyProfileLoadError({ code: 'auth/user-token-expired' }), 'unauthenticated');
  assert.match(profileLoadMessage('unauthenticated'), /Sign out and sign in again/);
  assert.equal(classifyProfileLoadError({ code: 'deadline-exceeded' }), 'unavailable');
  assert.match(profileLoadMessage('unavailable'), /reach the profile service/);
  assert.equal(classifyProfileLoadError({ code: 'failed-precondition' }), 'service-configuration');
  assert.equal(classifyProfileLoadError({ code: 'not-found' }), 'service-configuration');
  assert.equal(classifyProfileLoadError({ code: 'profile-pending-writes' }), 'pending');
  assert.equal(classifyProfileLoadError(new Error('private server details')), 'unknown');
  assert.ok(!profileLoadMessage('unknown').includes('private server details'));
});

test('only transients may retain a previously verified same-account profile', () => {
  assert.equal(canKeepVerifiedProfile('unavailable'), true);
  assert.equal(canKeepVerifiedProfile('pending'), true);
  for (const error of ['permission-denied', 'unauthenticated', 'service-configuration', 'unknown'] as const) {
    assert.equal(canKeepVerifiedProfile(error), false);
  }
});
