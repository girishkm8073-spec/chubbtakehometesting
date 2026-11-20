import { randomUUID } from 'node:crypto';
import { env, UserCredentials } from '../config/env';
import { ApiRoutes, HttpStatus } from '../constants/api';
import { ApiSession } from './api-session';

const GENERATED_EMAIL_DOMAIN = 'qa-automation.test';
const GENERATED_NAME_PREFIX = 'QA Claimant';
const UNIQUE_SUFFIX_LENGTH = 8;

/**
 * Registers a brand-new claimant through the public signup endpoint.
 * Each worker gets its own claimant, so "my claims" assertions are never polluted by
 * other tests or by data already in the database.
 */
export async function registerFreshClaimant(): Promise<UserCredentials & { name: string }> {
  const suffix = randomUUID().slice(0, UNIQUE_SUFFIX_LENGTH);
  const user = {
    email: `claimant-${suffix}@${GENERATED_EMAIL_DOMAIN}`,
    password: env.generatedUserPassword,
    name: `${GENERATED_NAME_PREFIX} ${suffix}`,
  };
  const session = await ApiSession.anonymous();
  try {
    const response = await session.post(ApiRoutes.auth.signup, user);
    if (response.status() !== HttpStatus.CREATED) {
      throw new Error(`Signup failed for ${user.email}: HTTP ${response.status()} ${await response.text()}`);
    }
  } finally {
    await session.dispose();
  }
  return user;
}
