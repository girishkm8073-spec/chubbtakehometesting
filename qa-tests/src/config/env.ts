import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Single source of truth for environment-specific values.
 * Fails fast with a clear message when a required variable is missing, instead of
 * letting a test fail later with a confusing connection or auth error.
 */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable "${name}". Copy qa-tests/.env.example to qa-tests/.env.`);
  }
  return value.trim();
}

function requiredNumber(name: string): number {
  const raw = required(name);
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable "${name}" must be numeric, got "${raw}"`);
  }
  return parsed;
}

const qaRoot = path.resolve(__dirname, '../..');

export const env = {
  uiBaseUrl: required('UI_BASE_URL'),
  bffBaseUrl: required('BFF_BASE_URL'),
  claimsServiceBaseUrl: required('CLAIMS_SERVICE_BASE_URL'),
  bffWebSocketUrl: required('BFF_WS_URL'),
  users: {
    admin: { email: required('ADMIN_EMAIL'), password: required('ADMIN_PASSWORD') },
    claimant: { email: required('CLAIMANT_EMAIL'), password: required('CLAIMANT_PASSWORD') },
  },
  generatedUserPassword: required('GENERATED_USER_PASSWORD'),
  bffOpenApiSpecPath: path.resolve(qaRoot, required('BFF_OPENAPI_SPEC')),
  claimEventSchemaDir: path.resolve(qaRoot, required('CLAIM_EVENT_SCHEMA_DIR')),
  realtimeEventTimeoutMs: requiredNumber('REALTIME_EVENT_TIMEOUT_MS'),
  testTimezone: required('TEST_TIMEZONE'),
  kafka: {
    brokers: required('KAFKA_BROKERS').split(','),
    claimEventsTopic: required('KAFKA_CLAIM_EVENTS_TOPIC'),
  },
} as const;

export type UserCredentials = { email: string; password: string };
