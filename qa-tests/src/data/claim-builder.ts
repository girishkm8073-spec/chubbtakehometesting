import { randomUUID } from 'node:crypto';
import { SubmitClaimRequest } from './claim-types';
import { dateDaysFromToday } from './dates';

const DEFAULT_INCIDENT_DAYS_AGO = 3;
const DEFAULT_AMOUNT = 2500.5;
const UNIQUE_TAG_LENGTH = 8;

/**
 * Builds valid claim payloads with a unique tag in the description so a test can always
 * find "its" claim in a shared list — no reliance on list position or pre-existing data.
 */
export class ClaimBuilder {
  private readonly tag = `QA-${randomUUID().slice(0, UNIQUE_TAG_LENGTH)}`;
  private claim: SubmitClaimRequest = {
    incidentDate: dateDaysFromToday(-DEFAULT_INCIDENT_DAYS_AGO),
    incidentLocation: '221B Baker Street, London',
    description: `${this.tag} Rear bumper damaged in a car park collision`,
    claimAmount: DEFAULT_AMOUNT,
  };

  static aValidClaim(): ClaimBuilder {
    return new ClaimBuilder();
  }

  get uniqueTag(): string {
    return this.tag;
  }

  withIncidentDate(isoDate: string): this {
    this.claim.incidentDate = isoDate;
    return this;
  }

  withIncidentLocation(location: string): this {
    this.claim.incidentLocation = location;
    return this;
  }

  /** Replaces the description entirely (the unique tag is lost — use for length boundaries). */
  withDescription(description: string): this {
    this.claim.description = description;
    return this;
  }

  /** Pads the tagged description to an exact length, keeping the tag searchable. */
  withDescriptionOfLength(length: number): this {
    this.claim.description = padTo(`${this.tag} `, length);
    return this;
  }

  withLocationOfLength(length: number): this {
    this.claim.incidentLocation = padTo('Loc ', length);
    return this;
  }

  withAmount(amount: number): this {
    this.claim.claimAmount = amount;
    return this;
  }

  build(): SubmitClaimRequest {
    return { ...this.claim };
  }
}

function padTo(prefix: string, length: number): string {
  if (length <= prefix.length) return prefix.slice(0, length);
  return prefix + 'x'.repeat(length - prefix.length);
}
