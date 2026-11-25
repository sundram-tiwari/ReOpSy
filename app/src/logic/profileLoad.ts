import { profileErrorCode } from './profileSave';

export type ProfileLoadError = 'unavailable' | 'permission-denied' | 'unauthenticated' | 'service-configuration' | 'pending' | 'unknown';

export function classifyProfileLoadError(error: unknown): ProfileLoadError {
  switch (profileErrorCode(error)) {
    case 'unavailable':
    case 'deadline-exceeded':
    case 'resource-exhausted':
      return 'unavailable';
    case 'permission-denied':
      return 'permission-denied';
    case 'unauthenticated':
    case 'auth/user-token-expired':
    case 'auth/invalid-user-token':
      return 'unauthenticated';
    case 'failed-precondition':
    case 'not-found':
      // A real missing profile is an exists() === false snapshot, not an SDK error.
      return 'service-configuration';
    case 'profile-pending-writes':
      return 'pending';
    default:
      return 'unknown';
  }
}

export function profileLoadMessage(error: ProfileLoadError): string {
  switch (error) {
    case 'unavailable':
      return 'ReOpSy could not reach the profile service. Try again in a moment.';
    case 'permission-denied':
      return 'ReOpSy’s server denied access to your profile. If retrying does not work, report this to ReOpSy.';
    case 'unauthenticated':
      return 'ReOpSy could not verify your sign-in. Sign out and sign in again.';
    case 'service-configuration':
      return 'ReOpSy’s profile service is not ready. If this persists, report it to ReOpSy.';
    case 'pending':
      return 'Your previously submitted profile change has not synced. Wait a moment, then retry.';
    case 'unknown':
      return 'ReOpSy could not verify your profile. Try again in a moment.';
  }
}

export function canKeepVerifiedProfile(error: ProfileLoadError): boolean {
  return error === 'unavailable' || error === 'pending';
}
