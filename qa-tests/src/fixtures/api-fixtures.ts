import { test as base } from '@playwright/test';
import { AdminClaimsApi } from '../api/admin-claims-api';
import { ApiSession } from '../api/api-session';
import { registerFreshClaimant } from '../api/auth-api';
import { ClaimLifecycle } from '../api/claim-lifecycle';
import { ClaimsApi } from '../api/claims-api';
import { env, UserCredentials } from '../config/env';

type WorkerFixtures = {
  claimantCredentials: UserCredentials;
};

type TestFixtures = {
  adminSession: ApiSession;
  claimantSession: ApiSession;
  otherClaimantSession: ApiSession;
  anonymousSession: ApiSession;
  claimsApi: ClaimsApi;
  otherClaimantClaimsApi: ClaimsApi;
  adminClaimsApi: AdminClaimsApi;
  claimantAsAdminApi: AdminClaimsApi;
  lifecycle: ClaimLifecycle;
};

/**
 * API fixtures. Sessions are created and disposed by the fixture, never by the test,
 * so a failing test cannot leak a logged-in context into the next one.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  claimantCredentials: [
    async ({}, use) => {
      await use(await registerFreshClaimant());
    },
    { scope: 'worker' },
  ],
  // Test-scoped on purpose: the BFF access_token cookie expires after 5 minutes,
  // so a worker-long session would start failing with 401 part-way through a run.
  adminSession: async ({}, use) => {
    const session = await ApiSession.authenticated(env.users.admin);
    await use(session);
    await session.dispose();
  },
  claimantSession: async ({ claimantCredentials }, use) => {
    const session = await ApiSession.authenticated(claimantCredentials);
    await use(session);
    await session.dispose();
  },
  otherClaimantSession: async ({}, use) => {
    const session = await ApiSession.authenticated(env.users.claimant);
    await use(session);
    await session.dispose();
  },
  anonymousSession: async ({}, use) => {
    const session = await ApiSession.anonymous();
    await use(session);
    await session.dispose();
  },
  claimsApi: async ({ claimantSession }, use) => use(new ClaimsApi(claimantSession)),
  otherClaimantClaimsApi: async ({ otherClaimantSession }, use) => use(new ClaimsApi(otherClaimantSession)),
  adminClaimsApi: async ({ adminSession }, use) => use(new AdminClaimsApi(adminSession)),
  claimantAsAdminApi: async ({ claimantSession }, use) => use(new AdminClaimsApi(claimantSession)),
  lifecycle: async ({ claimsApi, adminClaimsApi }, use) => use(new ClaimLifecycle(claimsApi, adminClaimsApi)),
});

export { expect } from '@playwright/test';
