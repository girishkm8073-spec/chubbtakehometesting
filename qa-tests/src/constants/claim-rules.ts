/**
 * Business rules for a claim, as documented in the BFF OpenAPI contract (SubmitClaimRequest)
 * and enforced by the domain model (claims-service Claim.java).
 * Tests derive boundary values from these constants rather than embedding magic numbers.
 */
export const ClaimRules = {
  description: { minLength: 10, maxLength: 1000, summaryMaxLength: 100 },
  incidentLocation: { minLength: 5, maxLength: 200 },
  claimAmount: { min: 0.01, max: 1_000_000, decimalPlaces: 2 },
} as const;

export const ClaimStatus = {
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED',
} as const;

export type ClaimStatusValue = (typeof ClaimStatus)[keyof typeof ClaimStatus];

/**
 * Forward lifecycle used as the test oracle (matches ClaimStatus.canTransitionTo and the UI's
 * claim-status-transitions.ts), except for the disputed backward move listed separately below.
 */
export const AllowedTransitions: Record<ClaimStatusValue, readonly ClaimStatusValue[]> = {
  SUBMITTED: [ClaimStatus.UNDER_REVIEW, ClaimStatus.REJECTED],
  UNDER_REVIEW: [ClaimStatus.APPROVED, ClaimStatus.REJECTED],
  APPROVED: [ClaimStatus.CLOSED],
  REJECTED: [ClaimStatus.CLOSED],
  CLOSED: [],
};

/**
 * UNDER_REVIEW -> SUBMITTED is allowed by backend and UI but no requirement explains it
 * (raised as DEF-010, a query for the product owner). It is excluded from both the allowed and
 * forbidden oracles so the suite does not assert either answer before the business decides.
 */
export const DisputedTransitions: readonly { from: ClaimStatusValue; to: ClaimStatusValue }[] = [
  { from: ClaimStatus.UNDER_REVIEW, to: ClaimStatus.SUBMITTED },
];

/** Shortest admin path from SUBMITTED to each status — used to put a claim into a given state. */
export const PathFromSubmitted: Record<ClaimStatusValue, readonly ClaimStatusValue[]> = {
  SUBMITTED: [],
  UNDER_REVIEW: [ClaimStatus.UNDER_REVIEW],
  APPROVED: [ClaimStatus.UNDER_REVIEW, ClaimStatus.APPROVED],
  REJECTED: [ClaimStatus.REJECTED],
  CLOSED: [ClaimStatus.REJECTED, ClaimStatus.CLOSED],
};
