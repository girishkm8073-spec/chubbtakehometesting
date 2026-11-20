import { APIResponse } from '@playwright/test';
import { ApiRoutes } from '../constants/api';
import { ClaimStatusValue } from '../constants/claim-rules';
import { ApiSession } from './api-session';

export type AdminClaimFilter = { status?: ClaimStatusValue; userId?: string };

/** Admin-only claim endpoints of the BFF. */
export class AdminClaimsApi {
  constructor(private readonly session: ApiSession) {}

  listAll(filter: AdminClaimFilter = {}): Promise<APIResponse> {
    const params: Record<string, string> = {};
    if (filter.status) params.status = filter.status;
    if (filter.userId) params.userId = filter.userId;
    return this.session.get(ApiRoutes.admin.claims, params);
  }

  updateStatus(claimId: string, newStatus: ClaimStatusValue | string): Promise<APIResponse> {
    return this.session.patch(ApiRoutes.admin.claimStatus(claimId), { newStatus });
  }
}
