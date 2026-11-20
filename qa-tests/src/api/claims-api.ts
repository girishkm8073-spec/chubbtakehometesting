import { APIResponse } from '@playwright/test';
import { ApiRoutes } from '../constants/api';
import { ApiSession } from './api-session';
import { SubmitClaimRequest } from '../data/claim-types';

/** Claimant-facing claim endpoints of the BFF. */
export class ClaimsApi {
  constructor(private readonly session: ApiSession) {}

  submit(claim: SubmitClaimRequest | Record<string, unknown>): Promise<APIResponse> {
    return this.session.post(ApiRoutes.claims.collection, claim);
  }

  listMine(): Promise<APIResponse> {
    return this.session.get(ApiRoutes.claims.collection);
  }

  getById(claimId: string): Promise<APIResponse> {
    return this.session.get(ApiRoutes.claims.byId(claimId));
  }
}
