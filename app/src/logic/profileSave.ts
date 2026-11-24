export function profileErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    // Firebase exposes short machine-readable codes; don't pass through raw error text.
    return error.code.replace(/^firestore\//, '');
  }
  return '';
}

export function profileSaveMessage(error: unknown): string {
  switch (profileErrorCode(error)) {
    case 'permission-denied':
      return 'ReOpSy’s server did not allow this profile change. Your changes were not saved.';
    case 'unauthenticated':
      return 'Your sign-in is no longer valid. Sign in again before saving your profile.';
    case 'unavailable':
      return 'The profile service is temporarily unavailable. Try again in a moment.';
    case 'deadline-exceeded':
      return 'ReOpSy could not confirm the save. Reopen your profile before retrying.';
    case 'aborted':
      return 'Another change happened while saving. Reopen your profile and try again.';
    default:
      return 'Could not confirm the profile save. Reopen your profile before retrying.';
  }
}
