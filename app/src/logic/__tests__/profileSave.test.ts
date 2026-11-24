import test from 'node:test';
import assert from 'node:assert/strict';
import { profileErrorCode, profileSaveMessage } from '../profileSave';

test('profile save does not blame the connection for server authorization failure', () => {
  assert.match(profileSaveMessage({ code: 'permission-denied' }), /server did not allow/);
  assert.match(profileSaveMessage({ code: 'firestore/unauthenticated' }), /Sign in again/);
  assert.match(profileSaveMessage({ code: 'unavailable' }), /temporarily unavailable/);
});

test('ambiguous writes prompt a readback and omit raw provider errors', () => {
  const error = { code: 'deadline-exceeded', message: 'private provider detail' };
  assert.match(profileSaveMessage(error), /could not confirm/);
  assert.doesNotMatch(profileSaveMessage(error), /private provider detail/);
  assert.equal(profileErrorCode(null), '');
});
