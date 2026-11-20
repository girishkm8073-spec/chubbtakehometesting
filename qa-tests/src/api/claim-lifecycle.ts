import { HttpStatus } from '../constants/api';
import { ClaimStatusValue, PathFromSubmitted } from '../constants/claim-rules';
import { ClaimBuilder } from '../data/claim-builder';
import { ClaimResponse } from '../data/claim-types';
import { AdminClaimsApi } from './admin-claims-api';
import { ClaimsApi } from './claims-api';

/**
 * Test-data arrangement through the public API (no DB seeding), so every precondition
 * is created by the same code paths a real user exercises.
 */
export class ClaimLifecycle {
  constructor(
    private readonly claimsApi: ClaimsApi,
    private readonly adminClaimsApi: AdminClaimsApi,
  ) {}

  async submit(builder: ClaimBuilder = ClaimBuilder.aValidClaim()): Promise<ClaimResponse> {
    const response = await this.claimsApi.submit(builder.build());
    if (response.status() !== HttpStatus.CREATED) {
      throw new Error(`Arrange step failed: submit claim -> HTTP ${response.status()} ${await response.text()}`);
    }
    return (await response.json()) as ClaimResponse;
  }

  /** Submits a claim and walks it through the admin workflow to the requested status. */
  async submitInStatus(target: ClaimStatusValue, builder?: ClaimBuilder): Promise<ClaimResponse> {
    let claim = await this.submit(builder);
    for (const status of PathFromSubmitted[target]) {
      const response = await this.adminClaimsApi.updateStatus(claim.claimId, status);
      if (response.status() !== HttpStatus.OK) {
        throw new Error(
          `Arrange step failed: move ${claim.claimId} to ${status} -> HTTP ${response.status()} ${await response.text()}`,
        );
      }
      claim = (await response.json()) as ClaimResponse;
    }
    return claim;
  }
}
