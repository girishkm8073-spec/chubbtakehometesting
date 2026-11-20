import { ClaimStatus } from '../../src/constants/claim-rules';
import { EventContract, EventSchema } from '../../src/contract/event-contract';
import { expect, test } from '../../src/fixtures/api-fixtures';
import { ClaimEventListener } from '../../src/messaging/claim-event-listener';

const EventType = {
  submitted: 'claim-submitted',
  statusChanged: 'claim-status-changed',
} as const;

/**
 * Producer-side message contract: what claims-service actually puts on Kafka must satisfy the
 * AsyncAPI schemas it publishes (asyncapi/schemas/*.json), which the BFF also ships as its consumer contract.
 * Requires the stack in direct-Kafka mode (APP_EVENTS_CDC_ENABLED=false) — see README.
 */
test.describe('Kafka claim events match the AsyncAPI contract @contract @integration @claims', () => {
  const eventContract = new EventContract();
  let listener: ClaimEventListener;

  test.beforeEach(async () => {
    listener = new ClaimEventListener();
    await listener.start();
  });

  test.afterEach(async () => {
    await listener.stop();
  });

  test('TC-CON-EVT-001 a claim-submitted event carries every field required by ClaimSubmittedMessage', async ({
    lifecycle,
  }) => {
    const claim = await lifecycle.submit();

    const event = await listener.waitFor(EventType.submitted, claim.claimId);

    const result = eventContract.validate(EventSchema.claimSubmitted, event.payload);
    expect(result.errors, 'claim-submitted payload violates ClaimSubmittedMessage.json').toEqual([]);
    expect(event.payload).toMatchObject({
      claimId: claim.claimId,
      userId: claim.userId,
      incidentDate: claim.incidentDate,
      claimAmount: claim.claimAmount,
    });
  });

  test('TC-CON-EVT-002 a claim-status-changed event carries every field required by ClaimStatusChangedMessage', async ({
    lifecycle,
    adminClaimsApi,
  }) => {
    const claim = await lifecycle.submit();

    await adminClaimsApi.updateStatus(claim.claimId, ClaimStatus.UNDER_REVIEW);
    const event = await listener.waitFor(EventType.statusChanged, claim.claimId);

    const result = eventContract.validate(EventSchema.claimStatusChanged, event.payload);
    expect(result.errors, 'claim-status-changed payload violates ClaimStatusChangedMessage.json').toEqual([]);
    expect(event.payload).toMatchObject({
      claimId: claim.claimId,
      oldStatus: ClaimStatus.SUBMITTED,
      newStatus: ClaimStatus.UNDER_REVIEW,
    });
  });

  test('TC-CON-EVT-003 the status event is addressed to the claim owner so the BFF can route the WebSocket push', async ({
    lifecycle,
    adminClaimsApi,
  }) => {
    const claim = await lifecycle.submit();

    await adminClaimsApi.updateStatus(claim.claimId, ClaimStatus.UNDER_REVIEW);
    const event = await listener.waitFor(EventType.statusChanged, claim.claimId);

    expect(event.payload.userId, 'BFF routes the push by payload.userId').toBe(claim.userId);
  });
});
