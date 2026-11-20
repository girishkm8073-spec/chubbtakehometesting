import * as fs from 'node:fs';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import * as yaml from 'js-yaml';
import { env } from '../config/env';

type JsonSchema = Record<string, unknown>;
interface OpenApiDocument {
  paths: Record<string, Record<string, { operationId?: string; responses?: Record<string, ResponseObject> }>>;
  components: { schemas: Record<string, JsonSchema> };
}
interface ResponseObject {
  content?: Record<string, { schema?: JsonSchema }>;
}

export interface ContractResult {
  valid: boolean;
  errors: string[];
}

const JSON_MEDIA_TYPE = 'application/json';
/** OpenAPI numeric/string formats that are informational only and have no JSON-Schema validator. */
const INFORMATIONAL_FORMATS = ['double', 'float', 'int32', 'int64', 'password'];

/**
 * Validates real responses against the BFF OpenAPI document (the API-first source of truth).
 * This is consumer-side contract testing: the UI's generated client is built from the same
 * document, so any drift here is drift the UI will feel.
 */
export class OpenApiContract {
  private readonly ajv: Ajv;
  private readonly cache = new Map<string, ValidateFunction>();

  private constructor(private readonly document: OpenApiDocument) {
    this.ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(this.ajv);
    INFORMATIONAL_FORMATS.forEach((format) => this.ajv.addFormat(format, true));
  }

  static loadBff(): OpenApiContract {
    const raw = fs.readFileSync(env.bffOpenApiSpecPath, 'utf8');
    return new OpenApiContract(yaml.load(raw) as OpenApiDocument);
  }

  /** True when the contract documents this status code for the operation at all. */
  documentsStatus(operationId: string, status: number): boolean {
    return this.findResponse(operationId, status) !== undefined;
  }

  validate(operationId: string, status: number, body: unknown): ContractResult {
    const response = this.findResponse(operationId, status);
    if (!response) {
      return { valid: false, errors: [`HTTP ${status} is not a documented response of operation "${operationId}"`] };
    }
    const schema = response.content?.[JSON_MEDIA_TYPE]?.schema;
    if (!schema) {
      return { valid: true, errors: [] };
    }
    const validator = this.compile(`${operationId}:${status}`, schema);
    const valid = validator(body) as boolean;
    return { valid, errors: formatErrors(validator.errors) };
  }

  private findResponse(operationId: string, status: number): ResponseObject | undefined {
    for (const pathItem of Object.values(this.document.paths)) {
      for (const operation of Object.values(pathItem)) {
        if (operation.operationId === operationId) {
          return operation.responses?.[String(status)];
        }
      }
    }
    throw new Error(`Operation "${operationId}" not found in ${env.bffOpenApiSpecPath}`);
  }

  private compile(key: string, schema: JsonSchema): ValidateFunction {
    const cached = this.cache.get(key);
    if (cached) return cached;
    // Embed components so local "#/components/schemas/..." refs resolve against this root.
    const validator = this.ajv.compile({ ...schema, components: this.document.components });
    this.cache.set(key, validator);
    return validator;
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || '(root)'} ${error.message ?? ''}`.trim());
}
