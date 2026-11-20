import { randomUUID } from 'node:crypto';
import { expectContractResponse, expectProblemDetail, expectStatus } from '../../src/assertions/api-assertions';
import { HttpStatus, OperationId } from '../../src/constants/api';
import { AllowedTransitions, ClaimStatus, ClaimStatusValue, DisputedTransitions } from '../../src/constants/claim-rules';
import { ClaimResponse } from '../../src/data/claim-types';
import { expect, test } from '../../src/fixtures/api-fixtures';

const ALL_STATUSES = Object.values(ClaimStatus);

const allowedPairs = ALL_STATUSES.flatMap((from) => AllowedTransitions[from].map((to) => ({ from, to })));
const isDisputed = (from: ClaimStatusValue, to: ClaimStatusValue) =>
  DisputedTransitions.some((pair) => pair.from === from && pair.to === to);
const forbiddenPairs = ALL_STATUSES.flatMap((from) =>
  ALL_STATUSES.filter((to) => to !== from && !AllowedTransitions[from].includes(to) && !isDisputed(from, to)).map(
    (to) => ({ from, to }),
  ),
);

test.describe('Admin API — claim status workflow @api @claims @admin', () => {
  test.describe('allowed transitions succeed and are persisted', () => {
    for (const { from, to } of allowedPairs) {
      test(`TC-API-ADM-${from}-${to} admin moves a claim from ${from} to ${to}`, async ({
        lifecycle,
        adminClaimsApi,
        claimsApi,
      }) => {
        const claim = await lifecycle.submitInStatus(from);

        const updated = await expectContractResponse<ClaimResponse>(
          await adminClaimsApi.updateStatus(claim.claimId, to),
          OperationId.updateClaimStatus,
          HttpStatus.OK,
        );

        expect(updated.claimId).toBe(claim.claimId);
        expect(updated.status).toBe(to);
        expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(claim.updatedAt));
        expect(Date.parse(updated.createdAt), 'createdAt must never change').toBe(Date.parse(claim.createdAt));

        const ownerView = await expectStatus<ClaimResponse>(await claimsApi.getById(claim.claimId), HttpStatus.OK);
        expect(ownerView.status, 'claimant must see the new status').toBe(to);
      });
    }
  });

  test.describe('forbidden transitions are rejected with 400 and leave the claim unchanged', () => {
    for (const { from, to } of forbiddenPairs) {
      test(`TC-API-ADM-${from}-${to} admin cannot move a claim from ${from} to ${to}`, async ({
        lifecycle,
        adminClaimsApi,
        claimsApi,
      }) => {
        const claim = await lifecycle.submitInStatus(from);

        const response = await adminClaimsApi.updateStatus(claim.claimId, to);

        await expectProblemDetail(response, OperationId.updateClaimStatus, HttpStatus.BAD_REQUEST);
        const unchanged = await expectStatus<ClaimResponse>(await claimsApi.getById(claim.claimId), HttpStatus.OK);
        expect(unchanged.status).toBe(from);
      });
    }
  });

  test('TC-API-ADM-060 updating a claim that does not exist returns 404', async ({ adminClaimsApi }) => {
    const response = await adminClaimsApi.updateStatus(randomUUID(), ClaimStatus.UNDER_REVIEW);

    await expectProblemDetail(response, OperationId.updateClaimStatus, HttpStatus.NOT_FOUND);
  });

  test('TC-API-ADM-061 an unknown status value is rejected with 400', async ({ lifecycle, adminClaimsApi }) => {
    const claim = await lifecycle.submit();
    const UNKNOWN_STATUS = 'PAID';

    const response = await adminClaimsApi.updateStatus(claim.claimId, UNKNOWN_STATUS);

    expect(response.status()).toBe(HttpStatus.BAD_REQUEST);
  });
});

test.describe('Admin API — list and filter all claims @api @claims @admin', () => {
  test('TC-API-ADM-070 admin sees claims from every claimant', async ({ lifecycle, adminClaimsApi }) => {
    const claim = await lifecycle.submit();

    const all = await expectContractResponse<ClaimResponse[]>(
      await adminClaimsApi.listAll(),
      OperationId.listAllClaims,
      HttpStatus.OK,
    );

    expect(all.map((c) => c.claimId)).toContain(claim.claimId);
  });

  for (const status of ALL_STATUSES) {
    test(`TC-API-ADM-071 filter by status=${status} returns only ${status} claims`, async ({
      lifecycle,
      adminClaimsApi,
    }) => {
      const claim = await lifecycle.submitInStatus(status as ClaimStatusValue);

      const filtered = await expectContractResponse<ClaimResponse[]>(
        await adminClaimsApi.listAll({ status }),
        OperationId.listAllClaims,
        HttpStatus.OK,
      );

      expect(filtered.map((c) => c.claimId)).toContain(claim.claimId);
      expect(new Set(filtered.map((c) => c.status))).toEqual(new Set([status]));
    });
  }

  test('TC-API-ADM-072 filter by userId returns only that user\'s claims', async ({ lifecycle, adminClaimsApi }) => {
    const claim = await lifecycle.submit();

    const filtered = await expectStatus<ClaimResponse[]>(
      await adminClaimsApi.listAll({ userId: claim.userId }),
      HttpStatus.OK,
    );

    expect(filtered.map((c) => c.claimId)).toContain(claim.claimId);
    expect(new Set(filtered.map((c) => c.userId))).toEqual(new Set([claim.userId]));
  });

  test('TC-API-ADM-073 combined status and userId filters intersect', async ({ lifecycle, adminClaimsApi }) => {
    const submitted = await lifecycle.submit();
    const rejected = await lifecycle.submitInStatus(ClaimStatus.REJECTED);

    const filtered = await expectStatus<ClaimResponse[]>(
      await adminClaimsApi.listAll({ status: ClaimStatus.REJECTED, userId: submitted.userId }),
      HttpStatus.OK,
    );
    const ids = filtered.map((c) => c.claimId);

    expect(ids).toContain(rejected.claimId);
    expect(ids).not.toContain(submitted.claimId);
  });

  test('TC-API-ADM-074 the unfiltered admin list is ordered newest first like every filtered list', async ({
    adminClaimsApi,
    lifecycle,
  }) => {
    await lifecycle.submit();
    await lifecycle.submit();

    const all = await expectStatus<ClaimResponse[]>(await adminClaimsApi.listAll(), HttpStatus.OK);
    const createdAtTimes = all.map((claim) => Date.parse(claim.createdAt));

    expect(createdAtTimes).toEqual([...createdAtTimes].sort((a, b) => b - a));
  });
});
