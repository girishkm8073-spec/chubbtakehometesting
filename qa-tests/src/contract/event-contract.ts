import * as fs from 'node:fs';
import * as path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { env } from '../config/env';
import { ContractResult } from './openapi-contract';

export const EventSchema = {
  claimSubmitted: 'ClaimSubmittedMessage.json',
  claimStatusChanged: 'ClaimStatusChangedMessage.json',
} as const;

type EventSchemaFile = (typeof EventSchema)[keyof typeof EventSchema];

/** Validates Kafka event payloads against the AsyncAPI JSON Schemas shipped with claims-service. */
export class EventContract {
  private readonly ajv = new Ajv2020({ strict: false, allErrors: true });

  constructor() {
    addFormats(this.ajv);
  }

  validate(schemaFile: EventSchemaFile, payload: unknown): ContractResult {
    const schema = JSON.parse(fs.readFileSync(path.join(env.claimEventSchemaDir, schemaFile), 'utf8'));
    const validator = this.ajv.getSchema(schema.$id) ?? this.ajv.compile(schema);
    const valid = validator(payload) as boolean;
    const errors = (validator.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim());
    return { valid, errors };
  }
}
