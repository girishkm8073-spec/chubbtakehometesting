import { expectContractResponse, expectProblemDetail, expectStatus } from '../../src/assertions/api-assertions';
import { ApiRoutes, HttpStatus, OperationId } from '../../src/constants/api';
import { ClaimRules, ClaimStatus } from '../../src/constants/claim-rules';
import { ClaimBuilder } from '../../src/data/claim-builder';
import { domainRuleViolations, invalidClaimBoundaries, validClaimBoundaries } from '../../src/data/claim-boundaries';
import { ClaimResponse } from '../../src/data/claim-types';
import { expect, test } from '../../src/fixtures/api-fixtures';

const MAX_CREATION_CLOCK_SKEW_MS = 60_000;

test.describe('Claims API — submit a claim @api @claims', () => {
  test('TC-API-CLM-001 a valid claim is created in SUBMITTED status and echoes every submitted field @smoke', async ({
    claimsApi,
  }) => {
    const request = ClaimBuilder.aValidClaim().build();

    const created = await expectContractResponse<ClaimResponse>(
      await claimsApi.submit(request),
      OperationId.submitClaim,
      HttpStatus.CREATED,
    );

    expect(created).toMatchObject({
      incidentDate: request.incidentDate,
      incidentLocation: request.incidentLocation,
      description: request.description,
      claimAmount: request.claimAmount,
      status: ClaimStatus.SUBMITTED,
    });
    expect(created.createdAt).toBe(created.updatedAt);
    expect(Math.abs(Date.now() - Date.parse(created.createdAt))).toBeLessThan(MAX_CREATION_CLOCK_SKEW_MS);
  });

  test('TC-API-CLM-002 a submitted claim is persisted and retrievable by its owner with identical data', async ({
    claimsApi,
  }) => {
    const request = ClaimBuilder.aValidClaim().build();
    const created = await expectStatus<ClaimResponse>(await claimsApi.submit(request), HttpStatus.CREATED);

    const fetched = await expectContractResponse<ClaimResponse>(
      await claimsApi.getById(created.claimId),
      OperationId.getClaim,
      HttpStatus.OK,
    );

    const { createdAt, updatedAt, ...businessFields } = created;
    expect(fetched).toMatchObject(businessFields);
    // POST echoes the in-memory Instant; GET returns the stored TIMESTAMP (microseconds). Compare at ms precision.
    expect(Date.parse(fetched.createdAt)).toBe(Date.parse(createdAt));
    expect(Date.parse(fetched.updatedAt)).toBe(Date.parse(updatedAt));
  });

  test('TC-API-CLM-003 leading and trailing whitespace is trimmed from description and location', async ({
    claimsApi,
  }) => {
    const builder = ClaimBuilder.aValidClaim();
    const clean = builder.build();
    const padded = { ...clean, description: `  ${clean.description}  `, incidentLocation: `  ${clean.incidentLocation}  ` };

    const created = await expectStatus<ClaimResponse>(await claimsApi.submit(padded), HttpStatus.CREATED);

    expect(created.description).toBe(clean.description);
    expect(created.incidentLocation).toBe(clean.incidentLocation);
  });

  test('TC-API-CLM-004 claim amount keeps exactly two decimal places (currency precision)', async ({ claimsApi }) => {
    const amountWithSubCentFraction = 100.999;
    const request = ClaimBuilder.aValidClaim().withAmount(amountWithSubCentFraction).build();

    const response = await claimsApi.submit(request);

    // Either reject (400) or persist exactly what was sent — silently changing money is not acceptable.
    // Re-read via GET: the create response is built from the in-memory entity, not the stored DECIMAL(12,2) value.
    if (response.status() === HttpStatus.CREATED) {
      const created = (await response.json()) as ClaimResponse;
      const persisted = await expectStatus<ClaimResponse>(await claimsApi.getById(created.claimId), HttpStatus.OK);
      expect(created.claimAmount, 'Create response differs from what was sent').toBe(amountWithSubCentFraction);
      expect(persisted.claimAmount, 'Persisted amount silently rounded').toBe(amountWithSubCentFraction);
    } else {
      await expectProblemDetail(response, OperationId.submitClaim, HttpStatus.BAD_REQUEST);
    }
  });

  test.describe('boundary values that must be accepted', () => {
    for (const boundary of validClaimBoundaries) {
      test(`${boundary.id} accepts ${boundary.title}`, async ({ claimsApi }) => {
        const request = boundary.build().build();

        const created = await expectContractResponse<ClaimResponse>(
          await claimsApi.submit(request),
          OperationId.submitClaim,
          HttpStatus.CREATED,
        );

        expect(created.claimAmount).toBe(request.claimAmount);
        expect(created.description).toBe(request.description.trim());
        expect(created.incidentLocation).toBe(request.incidentLocation.trim());
        expect(created.incidentDate).toBe(request.incidentDate);
      });
    }
  });

  test.describe('boundary values that must be rejected with 400', () => {
    for (const boundary of invalidClaimBoundaries) {
      test(`${boundary.id} rejects ${boundary.title}`, async ({ claimsApi }) => {
        const response = await claimsApi.submit(boundary.build().build());

        await expectProblemDetail(response, OperationId.submitClaim, HttpStatus.BAD_REQUEST);
      });
    }
  });

  test.describe('schema-valid input that breaks a domain rule must be rejected with 400 (not 500)', () => {
    for (const violation of domainRuleViolations) {
      test(`${violation.id} rejects ${violation.title}`, async ({ claimsApi }) => {
        const response = await claimsApi.submit(violation.build().build());

        await expectProblemDetail(response, OperationId.submitClaim, HttpStatus.BAD_REQUEST);
      });
    }
  });

  test('TC-API-CLM-040 each required field is enforced when missing', async ({ claimsApi }) => {
    const valid = ClaimBuilder.aValidClaim().build();
    const requiredFields = Object.keys(valid) as (keyof typeof valid)[];

    for (const field of requiredFields) {
      const { [field]: _omitted, ...withoutField } = valid;
      await test.step(`missing ${field}`, async () => {
        await expectProblemDetail(await claimsApi.submit(withoutField), OperationId.submitClaim, HttpStatus.BAD_REQUEST);
      });
    }
  });

  test('TC-API-CLM-041 an unauthenticated caller cannot submit a claim', async ({ anonymousSession }) => {
    const response = await anonymousSession.post(ApiRoutes.claims.collection, ClaimBuilder.aValidClaim().build());

    expect([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]).toContain(response.status());
  });

  test('TC-API-CLM-042 a state-changing request without a CSRF token is refused', async ({ claimantSession }) => {
    const response = await claimantSession.postWithoutCsrf(ApiRoutes.claims.collection, ClaimBuilder.aValidClaim().build());

    expect(response.status()).toBe(HttpStatus.FORBIDDEN);
  });

  test('TC-API-CLM-043 description summary in the list is truncated to the contract maximum', async ({
    claimsApi,
  }) => {
    const builder = ClaimBuilder.aValidClaim().withDescriptionOfLength(ClaimRules.description.maxLength);
    const created = await expectStatus<ClaimResponse>(await claimsApi.submit(builder.build()), HttpStatus.CREATED);

    const list = await expectContractResponse<{ claimId: string; description: string }[]>(
      await claimsApi.listMine(),
      OperationId.listClaims,
      HttpStatus.OK,
    );
    const summary = list.find((claim) => claim.claimId === created.claimId);

    expect(summary, 'new claim missing from the owner list').toBeDefined();
    expect(summary!.description).toBe(created.description.slice(0, ClaimRules.description.summaryMaxLength));
  });
});
