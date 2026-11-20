import { ClaimRules } from '../constants/claim-rules';
import { ClaimBuilder } from './claim-builder';
import { dateDaysFromToday } from './dates';

/**
 * Boundary-value and equivalence-partition cases for claim submission.
 * Every value is derived from ClaimRules, so a rule change updates the tests in one place.
 * `id` maps to the test case document (docs/TEST_CASES.md).
 */
export interface ClaimInputCase {
  id: string;
  title: string;
  build: () => ClaimBuilder;
}

const { description, incidentLocation, claimAmount } = ClaimRules;
const ONE_CENT = 0.01;

export const validClaimBoundaries: ClaimInputCase[] = [
  { id: 'TC-API-CLM-010', title: `description at minimum length (${description.minLength})`, build: () => ClaimBuilder.aValidClaim().withDescriptionOfLength(description.minLength) },
  { id: 'TC-API-CLM-011', title: `description at maximum length (${description.maxLength})`, build: () => ClaimBuilder.aValidClaim().withDescriptionOfLength(description.maxLength) },
  { id: 'TC-API-CLM-012', title: `location at minimum length (${incidentLocation.minLength})`, build: () => ClaimBuilder.aValidClaim().withLocationOfLength(incidentLocation.minLength) },
  { id: 'TC-API-CLM-013', title: `location at maximum length (${incidentLocation.maxLength})`, build: () => ClaimBuilder.aValidClaim().withLocationOfLength(incidentLocation.maxLength) },
  { id: 'TC-API-CLM-014', title: `amount at minimum (${claimAmount.min})`, build: () => ClaimBuilder.aValidClaim().withAmount(claimAmount.min) },
  { id: 'TC-API-CLM-015', title: `amount at maximum (${claimAmount.max})`, build: () => ClaimBuilder.aValidClaim().withAmount(claimAmount.max) },
  { id: 'TC-API-CLM-016', title: 'incident date is today', build: () => ClaimBuilder.aValidClaim().withIncidentDate(dateDaysFromToday(0)) },
];

export const invalidClaimBoundaries: ClaimInputCase[] = [
  { id: 'TC-API-CLM-020', title: `description one below minimum (${description.minLength - 1})`, build: () => ClaimBuilder.aValidClaim().withDescriptionOfLength(description.minLength - 1) },
  { id: 'TC-API-CLM-021', title: `description one above maximum (${description.maxLength + 1})`, build: () => ClaimBuilder.aValidClaim().withDescriptionOfLength(description.maxLength + 1) },
  { id: 'TC-API-CLM-022', title: `location one below minimum (${incidentLocation.minLength - 1})`, build: () => ClaimBuilder.aValidClaim().withLocationOfLength(incidentLocation.minLength - 1) },
  { id: 'TC-API-CLM-023', title: `location one above maximum (${incidentLocation.maxLength + 1})`, build: () => ClaimBuilder.aValidClaim().withLocationOfLength(incidentLocation.maxLength + 1) },
  { id: 'TC-API-CLM-024', title: 'amount of zero', build: () => ClaimBuilder.aValidClaim().withAmount(0) },
  { id: 'TC-API-CLM-025', title: 'negative amount', build: () => ClaimBuilder.aValidClaim().withAmount(-ONE_CENT) },
  { id: 'TC-API-CLM-026', title: 'amount one cent above maximum', build: () => ClaimBuilder.aValidClaim().withAmount(claimAmount.max + ONE_CENT) },
];

/**
 * Inputs that satisfy the OpenAPI schema (so the BFF accepts them) but violate a domain rule
 * in claims-service. These exercise the BFF -> claims-service error propagation path.
 * Contract says 400 ProblemDetail.
 */
export const domainRuleViolations: ClaimInputCase[] = [
  { id: 'TC-API-CLM-030', title: 'incident date tomorrow (future)', build: () => ClaimBuilder.aValidClaim().withIncidentDate(dateDaysFromToday(1)) },
  { id: 'TC-API-CLM-031', title: 'description of only whitespace (passes length, fails trimmed length)', build: () => ClaimBuilder.aValidClaim().withDescription(' '.repeat(description.minLength + 1)) },
  { id: 'TC-API-CLM-032', title: 'location of only whitespace', build: () => ClaimBuilder.aValidClaim().withIncidentLocation(' '.repeat(incidentLocation.minLength + 1)) },
];
