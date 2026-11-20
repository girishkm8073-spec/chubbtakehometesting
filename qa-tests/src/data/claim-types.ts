import { ClaimStatusValue } from '../constants/claim-rules';

/** Shapes mirror the BFF OpenAPI components (bff-api.yml). */
export interface SubmitClaimRequest {
  incidentDate: string;
  incidentLocation: string;
  description: string;
  claimAmount: number;
}

export interface ClaimResponse extends SubmitClaimRequest {
  claimId: string;
  userId: string;
  status: ClaimStatusValue;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimSummaryResponse {
  claimId: string;
  incidentDate: string;
  description: string;
  claimAmount: number;
  status: ClaimStatusValue;
  createdAt: string;
}

export interface UserResponse {
  userId: string;
  email: string;
  name: string;
  role: 'CLAIMANT' | 'ADMIN';
  createdAt: string;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}
