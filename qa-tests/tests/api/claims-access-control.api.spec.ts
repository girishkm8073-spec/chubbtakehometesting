import { randomUUID } from 'node:crypto';
import { expectContractResponse, expectProblemDetail, expectStatus } from '../../src/assertions/api-assertions';
import { env } from '../../src/config/env';
import { ApiRoutes, HttpStatus, OperationId } from '../../src/constants/api';
import { ClaimStatus } from '../../src/constants/claim-rules';
import { ClaimBuilder } from '../../src/data/claim-builder';
import { ClaimSummaryResponse } from '../../src/data/claim-types';
import { expect, test } from '../../src/fixtures/api-fixtures';

test.describe('Claims API — ownership and access control @api @claims @security', () => {
  test('TC-API-CLM-050 the owner list contains the new claim, newest first', async ({ claimsApi, lifecycle }) => {
    const older = await lifecycle.submit();
    const newer = await lifecycle.submit();

    const list = await expectContractResponse<ClaimSummaryResponse[]>(
      await claimsApi.listMine(),
      OperationId.listClaims,
      HttpStatus.OK,
    );
    const ids = list.map((claim) => claim.claimId);

    expect(ids).toContain(older.claimId);
    expect(ids).toContain(newer.claimId);
    expect(ids.indexOf(newer.claimId)).toBeLessThan(ids.indexOf(older.claimId));
    const createdAtTimes = list.map((claim) => Date.parse(claim.createdAt));
    expect(createdAtTimes).toEqual([...createdAtTimes].sort((a, b) => b - a));
  });

  test('TC-API-CLM-051 a claimant never sees another claimant\'s claims in their list', async ({
    lifecycle,
    otherClaimantClaimsApi,
  }) => {
    const mine = await lifecycle.submit();

    const otherList = await expectStatus<ClaimSummaryResponse[]>(
      await otherClaimantClaimsApi.listMine(),
      HttpStatus.OK,
    );

    expect(otherList.map((claim) => claim.claimId)).not.toContain(mine.claimId);
  });

  test('TC-API-CLM-052 reading another claimant\'s claim by id returns 403 Forbidden', async ({
    lifecycle,
    otherClaimantClaimsApi,
  }) => {
    const mine = await lifecycle.submit();

    const response = await otherClaimantClaimsApi.getById(mine.claimId);

    await expectProblemDetail(response, OperationId.getClaim, HttpStatus.FORBIDDEN);
  });

  test('TC-API-CLM-053 reading a claim id that does not exist returns 404 Not Found', async ({ claimsApi }) => {
    const response = await claimsApi.getById(randomUUID());

    await expectProblemDetail(response, OperationId.getClaim, HttpStatus.NOT_FOUND);
  });

  test('TC-API-CLM-054 an unauthenticated caller cannot list claims', async ({ anonymousSession }) => {
    const response = await anonymousSession.get(ApiRoutes.claims.collection);

    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED);
  });

  test('TC-API-CLM-055 a claimant cannot call admin claim endpoints', async ({ claimantAsAdminApi, lifecycle }) => {
    const mine = await lifecycle.submit();

    await test.step('list all claims', async () => {
      expect((await claimantAsAdminApi.listAll()).status()).toBe(HttpStatus.FORBIDDEN);
    });
    await test.step('approve own claim', async () => {
      expect((await claimantAsAdminApi.updateStatus(mine.claimId, ClaimStatus.UNDER_REVIEW)).status()).toBe(
        HttpStatus.FORBIDDEN,
      );
    });
  });

  test('TC-API-CLM-056 concurrent submissions by two claimants are each attributed to the right owner', async ({
    claimsApi,
    otherClaimantClaimsApi,
  }) => {
    // The BFF shares one OpenAPI ApiClient bean and mutates its bearer token per request.
    // Under concurrency one user's token can be used for another user's call.
    const PARALLEL_SUBMISSIONS_PER_USER = 10;
    const mineBuilders = Array.from({ length: PARALLEL_SUBMISSIONS_PER_USER }, () => ClaimBuilder.aValidClaim());
    const theirBuilders = Array.from({ length: PARALLEL_SUBMISSIONS_PER_USER }, () => ClaimBuilder.aValidClaim());

    const responses = await Promise.all([
      ...mineBuilders.map((builder) => claimsApi.submit(builder.build())),
      ...theirBuilders.map((builder) => otherClaimantClaimsApi.submit(builder.build())),
    ]);
    for (const response of responses) expect(response.status()).toBe(HttpStatus.CREATED);

    const myList = await expectStatus<ClaimSummaryResponse[]>(await claimsApi.listMine(), HttpStatus.OK);
    const myDescriptions = myList.map((claim) => claim.description).join('\n');
    const leakedIntoMine = theirBuilders.filter((builder) => myDescriptions.includes(builder.uniqueTag));
    const missingFromMine = mineBuilders.filter((builder) => !myDescriptions.includes(builder.uniqueTag));

    expect(leakedIntoMine.map((b) => b.uniqueTag), 'Other user\'s claims were filed under my account').toEqual([]);
    expect(missingFromMine.map((b) => b.uniqueTag), 'My claims were filed under another account').toEqual([]);
  });
});

test.describe('Service hardening @api @security', () => {
  for (const [serviceName, baseUrl] of [
    ['claims-service', env.claimsServiceBaseUrl],
    ['bff-service', env.bffBaseUrl],
  ] as const) {
    test(`TC-API-SEC-001 ${serviceName} exposes only the health endpoint to anonymous callers`, async ({
      playwright,
    }) => {
      // Read the actuator discovery page rather than calling /heapdump, so the test never downloads a heap dump.
      const PUBLIC_ACTUATOR_LINKS = ['self', 'health', 'health-path'];
      const context = await playwright.request.newContext({ baseURL: baseUrl });

      const response = await context.get(ApiRoutes.actuator.root);
      const links =
        response.status() === HttpStatus.OK ? Object.keys(((await response.json()) as { _links: object })._links) : [];

      const nonPublic = links.filter((link) => !PUBLIC_ACTUATOR_LINKS.includes(link));
      expect(nonPublic, `${serviceName} publishes internal actuator endpoints anonymously`).toEqual([]);
      await context.dispose();
    });
  }
});
