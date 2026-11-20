import { expectContractResponse, expectToMatchContract } from '../../src/assertions/api-assertions';
import { ApiRoutes, AuthCookies, HttpStatus, OperationId } from '../../src/constants/api';
import { ClaimStatus } from '../../src/constants/claim-rules';
import { ClaimResponse, UserResponse } from '../../src/data/claim-types';
import { expect, test } from '../../src/fixtures/api-fixtures';

/**
 * Consumer-driven contract checks for the BFF: every response the UI's generated client relies on
 * is validated against bff-api.yml. Happy paths are also covered inline in the API suites; this file
 * focuses on the shapes the UI parses on *error* paths and on cross-cutting response properties.
 */
test.describe('BFF responses conform to bff-api.yml @contract @api', () => {
  test('TC-CON-API-001 login returns a UserResponse and sets HttpOnly auth cookies', async ({
    anonymousSession,
    claimantCredentials,
  }) => {
    const response = await anonymousSession.login(claimantCredentials);

    const user = await expectContractResponse<UserResponse>(response, OperationId.login, HttpStatus.OK);
    expect(user.email).toBe(claimantCredentials.email);
    expect(user.role).toBe('CLAIMANT');
    const setCookies = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
    expect(setCookies.some((c) => c.startsWith(`${AuthCookies.accessToken}=`) && /HttpOnly/i.test(c))).toBe(true);
  });

  test('TC-CON-API-002 invalid login returns a 401 ProblemDetail', async ({ anonymousSession, claimantCredentials }) => {
    const response = await anonymousSession.login({ ...claimantCredentials, password: `${claimantCredentials.password}x` });

    await expectContractResponse(response, OperationId.login, HttpStatus.UNAUTHORIZED);
  });

  test('TC-CON-API-003 unauthenticated claims list returns the documented 401 ProblemDetail body', async ({
    anonymousSession,
  }) => {
    const response = await anonymousSession.get(ApiRoutes.claims.collection);

    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED);
    const bodyText = await response.text();
    expect(bodyText, '401 has no ProblemDetail body for the UI to parse').not.toBe('');
    expectToMatchContract(OperationId.listClaims, HttpStatus.UNAUTHORIZED, JSON.parse(bodyText));
  });

  test('TC-CON-API-005 admin status update response is a full ClaimResponse', async ({ lifecycle, adminClaimsApi }) => {
    const claim = await lifecycle.submit();

    const updated = await expectContractResponse<ClaimResponse>(
      await adminClaimsApi.updateStatus(claim.claimId, ClaimStatus.UNDER_REVIEW),
      OperationId.updateClaimStatus,
      HttpStatus.OK,
    );

    expect(updated.userId).toBe(claim.userId);
  });
});
