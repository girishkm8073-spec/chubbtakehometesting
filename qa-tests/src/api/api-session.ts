import { APIRequestContext, APIResponse, request } from '@playwright/test';
import { env, UserCredentials } from '../config/env';
import { ApiRoutes, Csrf, HttpStatus } from '../constants/api';

/**
 * An HTTP session against the BFF with its own cookie jar.
 * Handles the two cross-cutting concerns every BFF call needs:
 *  - auth: the BFF sets an HttpOnly `access_token` cookie on login
 *  - CSRF: state-changing calls must echo the XSRF-TOKEN cookie in the X-XSRF-TOKEN header
 * One session == one user, so tests can act as several users without cookie bleed.
 */
export class ApiSession {
  private constructor(private readonly context: APIRequestContext) {}

  static async anonymous(): Promise<ApiSession> {
    const context = await request.newContext({ baseURL: env.bffBaseUrl });
    return new ApiSession(context);
  }

  static async authenticated(credentials: UserCredentials): Promise<ApiSession> {
    const session = await ApiSession.anonymous();
    const response = await session.login(credentials);
    if (response.status() !== HttpStatus.OK) {
      throw new Error(
        `Login failed for ${credentials.email}: HTTP ${response.status()} ${await response.text()}`,
      );
    }
    return session;
  }

  async login(credentials: UserCredentials): Promise<APIResponse> {
    return this.context.post(ApiRoutes.auth.login, { data: credentials });
  }

  async get(url: string, params?: Record<string, string>): Promise<APIResponse> {
    return this.context.get(url, { params });
  }

  async post(url: string, data: unknown): Promise<APIResponse> {
    return this.context.post(url, { data, headers: await this.csrfHeaders() });
  }

  async patch(url: string, data: unknown): Promise<APIResponse> {
    return this.context.patch(url, { data, headers: await this.csrfHeaders() });
  }

  /** Raw POST without a CSRF header — used to prove CSRF protection is enforced. */
  async postWithoutCsrf(url: string, data: unknown): Promise<APIResponse> {
    return this.context.post(url, { data });
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  private async csrfHeaders(): Promise<Record<string, string>> {
    let token = await this.readCsrfCookie();
    if (!token) {
      await this.context.get(ApiRoutes.auth.csrf);
      token = await this.readCsrfCookie();
    }
    if (!token) {
      throw new Error(`BFF did not issue a ${Csrf.cookieName} cookie from ${ApiRoutes.auth.csrf}`);
    }
    return { [Csrf.headerName]: token };
  }

  private async readCsrfCookie(): Promise<string | undefined> {
    const { cookies } = await this.context.storageState();
    return cookies.find((cookie) => cookie.name === Csrf.cookieName)?.value;
  }
}
