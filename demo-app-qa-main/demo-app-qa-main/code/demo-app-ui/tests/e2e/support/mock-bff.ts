import { expect, type Locator, type Page, type Request, type Route } from '@playwright/test';

/**
 * In-memory stand-in for the BFF, installed at the browser network layer.
 * It keeps claims in memory so multi-step journeys (submit, review, change status)
 * see consistent data, and it enforces the claim status rules from the spec
 * independently of the app code, so a UI that offers a forbidden move is caught.
 */

export type Role = 'CLAIMANT' | 'ADMIN';
export type ClaimStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CLOSED';

export interface DemoUser {
  userId: string;
  email: string;
  password: string;
  name: string;
  role: Role;
}

export interface ClaimRecord {
  claimId: string;
  userId: string;
  incidentDate: string;
  incidentLocation: string;
  description: string;
  claimAmount: number;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StatusUpdate {
  claimId: string;
  newStatus: ClaimStatus;
}

export const USERS: Record<'claimant' | 'admin', DemoUser> = {
  claimant: {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'claimant@demo.com',
    password: 'Claimant123!',
    name: 'Test Claimant',
    role: 'CLAIMANT',
  },
  admin: {
    userId: '22222222-2222-4222-8222-222222222222',
    email: 'admin@demo.com',
    password: 'Admin123!',
    name: 'Test Admin',
    role: 'ADMIN',
  },
};

/** Status rules as written in the spec (ClaimStatus.canTransitionTo). */
export const ALLOWED_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'SUBMITTED'],
  APPROVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
};

export const STATUS_LABELS: Record<ClaimStatus, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

const API_PREFIX = '/api/';
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

interface ForcedFailure {
  status: number;
  body: Record<string, unknown>;
}

type SessionState = 'active' | 'access-expired' | 'fully-expired';

const json = (route: Route, status: number, body?: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: body === undefined ? '' : JSON.stringify(body),
  });

const problem = (status: number, title: string, detail: string) => ({
  type: 'about:blank',
  title,
  status,
  detail,
});

// The admin UI keys its status controls by the first 8 characters of the id, so ids must differ there.
const nextClaimId = () => crypto.randomUUID();

/** A date N days before today, as YYYY-MM-DD (the format the API uses). */
export const daysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

export class MockBff {
  readonly claims: ClaimRecord[] = [];
  readonly statusUpdates: StatusUpdate[] = [];
  readonly submittedClaims: Record<string, unknown>[] = [];
  readonly calls: string[] = [];

  private currentUser: DemoUser | null = null;
  private session: SessionState = 'active';
  private readonly forcedFailures = new Map<string, ForcedFailure>();

  constructor(private readonly page: Page) {}

  async install(): Promise<this> {
    await this.page.route(
      (url) => url.pathname.startsWith(API_PREFIX),
      (route) => this.handle(route)
    );
    return this;
  }

  seedClaim(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
    const now = new Date().toISOString();
    const claim: ClaimRecord = {
      claimId: nextClaimId(),
      userId: USERS.claimant.userId,
      incidentDate: daysAgo(10),
      incidentLocation: '12 Harbour Road, Sydney',
      description: 'Storm damage to the roof and the back fence.',
      claimAmount: 4200,
      status: 'SUBMITTED',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    this.claims.push(claim);
    return claim;
  }

  /** The next call matching method + path fails with this status and body, once. */
  failNext(method: string, path: string, status: number, body: Record<string, unknown>): void {
    this.forcedFailures.set(`${method} ${path}`, { status, body });
  }

  /** Simulates the access token expiring; refresh succeeds or fails as chosen. */
  expireSession(refreshWorks: boolean): void {
    this.session = refreshWorks ? 'access-expired' : 'fully-expired';
  }

  claim(claimId: string): ClaimRecord {
    const found = this.claims.find((c) => c.claimId === claimId);
    if (!found) throw new Error(`No claim ${claimId} in the mock`);
    return found;
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    this.calls.push(`${method} ${path}${url.search}`);

    const forced = this.forcedFailures.get(`${method} ${path}`);
    if (forced) {
      this.forcedFailures.delete(`${method} ${path}`);
      return json(route, forced.status, forced.body);
    }

    if (path === '/api/auth/login' && method === 'POST') return this.login(route, request);
    if (path === '/api/auth/logout' && method === 'POST') return this.logout(route);
    if (path === '/api/auth/refresh' && method === 'POST') return this.refresh(route);

    if (this.session !== 'active' || !this.currentUser) {
      return json(route, 401, problem(401, 'Unauthorized', 'Access token expired'));
    }

    if (path === '/api/claims' && method === 'GET') return this.listOwnClaims(route);
    if (path === '/api/claims' && method === 'POST') return this.submitClaim(route, request);
    if (path.startsWith('/api/claims/') && method === 'GET') return this.getOwnClaim(route, path);

    if (path.startsWith('/api/admin/')) {
      if (this.currentUser.role !== 'ADMIN') {
        return json(route, 403, problem(403, 'Forbidden', 'Admin role required'));
      }
      if (path === '/api/admin/claims' && method === 'GET') return this.listAllClaims(route, url);
      if (path.endsWith('/status') && method === 'PATCH') return this.updateStatus(route, request, path);
      if (path === '/api/admin/dashboard/stats' && method === 'GET') return this.stats(route);
      if (path === '/api/admin/users' && method === 'GET') return json(route, 200, []);
    }

    return json(route, 404, problem(404, 'Not Found', `No mock for ${method} ${path}`));
  }

  private async login(route: Route, request: Request) {
    const { email, password } = request.postDataJSON() as { email: string; password: string };
    const user = Object.values(USERS).find((u) => u.email === email && u.password === password);
    if (!user) {
      return json(route, 401, problem(401, 'Unauthorized', 'Invalid email or password'));
    }
    this.currentUser = user;
    this.session = 'active';
    // Site-wide cookies (path '/'), as the real BFF sets them; a request URL here would scope them to /api/auth/.
    const siteRoot = `${new URL(request.url()).origin}/`;
    await this.page.context().addCookies([
      { name: ACCESS_COOKIE, value: `access-${user.role}`, url: siteRoot },
      { name: REFRESH_COOKIE, value: `refresh-${user.role}`, url: siteRoot },
    ]);
    const { password: _omit, ...publicUser } = user;
    return json(route, 200, publicUser);
  }

  private async logout(route: Route) {
    this.currentUser = null;
    await this.page.context().clearCookies();
    return route.fulfill({ status: 204 });
  }

  private refresh(route: Route) {
    if (this.session === 'access-expired') {
      this.session = 'active';
      return json(route, 204);
    }
    return json(route, 401, problem(401, 'Unauthorized', 'Refresh token expired'));
  }

  private listOwnClaims(route: Route) {
    const own = this.claims.filter((c) => c.userId === this.currentUser!.userId);
    return json(route, 200, own);
  }

  private getOwnClaim(route: Route, path: string) {
    const claimId = path.split('/').at(-1);
    const found = this.claims.find((c) => c.claimId === claimId && c.userId === this.currentUser!.userId);
    return found ? json(route, 200, found) : json(route, 404, problem(404, 'Not Found', 'Claim not found'));
  }

  private submitClaim(route: Route, request: Request) {
    const body = request.postDataJSON() as Record<string, unknown>;
    this.submittedClaims.push(body);
    const claim = this.seedClaim({
      userId: this.currentUser!.userId,
      incidentDate: String(body.incidentDate),
      incidentLocation: String(body.incidentLocation),
      description: String(body.description),
      claimAmount: Number(body.claimAmount),
    });
    return json(route, 201, claim);
  }

  private listAllClaims(route: Route, url: URL) {
    const status = url.searchParams.get('status');
    return json(route, 200, status ? this.claims.filter((c) => c.status === status) : this.claims);
  }

  private updateStatus(route: Route, request: Request, path: string) {
    const claimId = path.split('/').at(-2)!;
    const { newStatus } = request.postDataJSON() as { newStatus: ClaimStatus };
    const found = this.claims.find((c) => c.claimId === claimId);
    if (!found) return json(route, 404, problem(404, 'Not Found', 'Claim not found'));
    if (!ALLOWED_TRANSITIONS[found.status].includes(newStatus)) {
      return json(
        route,
        400,
        problem(400, 'Validation Error', `Cannot transition from ${found.status} to ${newStatus}`)
      );
    }
    found.status = newStatus;
    found.updatedAt = new Date().toISOString();
    this.statusUpdates.push({ claimId, newStatus });
    return json(route, 200, found);
  }

  private stats(route: Route) {
    const claimsByStatus = Object.fromEntries(
      (Object.keys(ALLOWED_TRANSITIONS) as ClaimStatus[]).map((s) => [
        s,
        this.claims.filter((c) => c.status === s).length,
      ])
    );
    return json(route, 200, {
      totalUsers: Object.keys(USERS).length,
      totalClaims: this.claims.length,
      claimsByStatus,
      cacheHit: false,
      queryTimeMs: 7,
    });
  }
}

/** Page-level actions shared by the journeys. */
export class AppActions {
  constructor(private readonly page: Page) {}

  async loginAs(user: DemoUser, expectedPath: RegExp): Promise<void> {
    await this.page.goto('/login');
    await this.page.locator('#email').fill(user.email);
    await this.page.locator('#password').fill(user.password);
    await this.page.getByRole('button', { name: /^log in$/i }).click();
    await expect(this.page).toHaveURL(expectedPath);
  }

  /** Waits for a client-side API response, which proves the page has hydrated. */
  waitForApi(method: string, pathname: string) {
    return this.page.waitForResponse(
      (r) => new URL(r.url()).pathname === pathname && r.request().method() === method
    );
  }

  async fillStep1(incidentDate: string, location: string, amount: string): Promise<void> {
    await this.page.locator('#incidentDate').fill(incidentDate);
    await this.page.locator('#incidentLocation').fill(location);
    await this.page.locator('#claimAmount').fill(amount);
  }

  async next(): Promise<void> {
    await this.page.getByRole('button', { name: /^next$/i }).click();
  }

  main() {
    return this.page.getByRole('main');
  }

  /**
   * Lists render twice (desktop table + mobile cards, one hidden by CSS), so list lookups
   * keep only the copy a user can actually see.
   */
  shown(locator: Locator): Locator {
    return locator.filter({ visible: true });
  }
}
