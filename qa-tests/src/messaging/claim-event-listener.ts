import { randomUUID } from 'node:crypto';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import { env } from '../config/env';

export interface ClaimEventEnvelope {
  eventType: string;
  eventId: string;
  payload: Record<string, unknown> & { claimId?: string };
}

const CLIENT_ID = 'qa-contract-tests';
const POLL_INTERVAL_MS = 200;

/**
 * Listens on the claim-events topic with a throw-away consumer group, starting from the latest offset,
 * so a test only ever sees events produced after it started listening.
 */
export class ClaimEventListener {
  private readonly received: ClaimEventEnvelope[] = [];
  private consumer?: Consumer;

  async start(): Promise<void> {
    const kafka = new Kafka({ clientId: CLIENT_ID, brokers: env.kafka.brokers, logLevel: logLevel.NOTHING });
    this.consumer = kafka.consumer({ groupId: `${CLIENT_ID}-${randomUUID()}` });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: env.kafka.claimEventsTopic, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (message.value) this.received.push(JSON.parse(message.value.toString()) as ClaimEventEnvelope);
      },
    });
  }

  async waitFor(eventType: string, claimId: string): Promise<ClaimEventEnvelope> {
    const deadline = Date.now() + env.realtimeEventTimeoutMs;
    while (Date.now() < deadline) {
      const match = this.received.find((e) => e.eventType === eventType && e.payload?.claimId === claimId);
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(
      `No "${eventType}" event for claim ${claimId} on topic ${env.kafka.claimEventsTopic} within ${env.realtimeEventTimeoutMs}ms`,
    );
  }

  async stop(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
