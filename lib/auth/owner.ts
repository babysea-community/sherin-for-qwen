import 'server-only';

import { requireEmailEnv } from '../utils/env';

/**
 * Single-user workspace. The owner email comes from the env file
 * and is the only Google account that may sign in.
 */
export function getOwnerEmail() {
  return requireEmailEnv('OWNER_EMAIL').toLowerCase();
}

export function isOwnerEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return email.trim().toLowerCase() === getOwnerEmail();
}
