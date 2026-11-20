import { APIResponse, expect } from '@playwright/test';
import { OperationId } from '../constants/api';
import { OpenApiContract } from '../contract/openapi-contract';
import { ProblemDetail } from '../data/claim-types';

type OperationIdValue = (typeof OperationId)[keyof typeof OperationId];

const contract = OpenApiContract.loadBff();

/**
 * Asserts the HTTP status and returns the parsed JSON body.
 * On mismatch the failure message includes the response body, so a 500 shows *why* without re-running.
 */
export async function expectStatus<T>(response: APIResponse, expectedStatus: number): Promise<T> {
  const bodyText = await response.text();
  expect(
    response.status(),
    `Expected HTTP ${expectedStatus} from ${response.url()} but got ${response.status()}. Body: ${bodyText}`,
  ).toBe(expectedStatus);
  return (bodyText ? JSON.parse(bodyText) : undefined) as T;
}

/** Asserts the body conforms to the OpenAPI schema documented for (operation, status). */
export function expectToMatchContract(operationId: OperationIdValue, status: number, body: unknown): void {
  const result = contract.validate(operationId, status, body);
  expect(result.errors, `Response of ${operationId} (HTTP ${status}) violates bff-api.yml`).toEqual([]);
  expect(result.valid).toBe(true);
}

/** Status + contract in one step — the default assertion for every documented response. */
export async function expectContractResponse<T>(
  response: APIResponse,
  operationId: OperationIdValue,
  expectedStatus: number,
): Promise<T> {
  const body = await expectStatus<T>(response, expectedStatus);
  expectToMatchContract(operationId, expectedStatus, body);
  return body;
}

/** RFC 7807 error with the expected status echoed in the body and a non-empty, human-readable detail. */
export async function expectProblemDetail(
  response: APIResponse,
  operationId: OperationIdValue,
  expectedStatus: number,
): Promise<ProblemDetail> {
  const problem = await expectContractResponse<ProblemDetail>(response, operationId, expectedStatus);
  expect(problem.status).toBe(expectedStatus);
  expect(problem.detail.trim().length).toBeGreaterThan(0);
  return problem;
}
