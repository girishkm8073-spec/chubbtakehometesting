export const ApiRoutes = {
  auth: {
    login: '/api/auth/login',
    signup: '/api/auth/signup',
    logout: '/api/auth/logout',
    csrf: '/api/auth/csrf',
  },
  claims: {
    collection: '/api/claims',
    byId: (claimId: string) => `/api/claims/${claimId}`,
  },
  admin: {
    claims: '/api/admin/claims',
    claimStatus: (claimId: string) => `/api/admin/claims/${claimId}/status`,
    users: '/api/admin/users',
    dashboardStats: '/api/admin/dashboard/stats',
  },
  actuator: {
    health: '/actuator/health',
    env: '/actuator/env',
  },
} as const;

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/** Spring Security CookieCsrfTokenRepository defaults used by the BFF. */
export const Csrf = {
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
} as const;

export const AuthCookies = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
} as const;

/** Operation ids from bff-api.yml — used to look up response schemas for contract checks. */
export const OperationId = {
  login: 'login',
  submitClaim: 'submitClaim',
  listClaims: 'listClaims',
  getClaim: 'getClaim',
  listAllClaims: 'listAllClaims',
  updateClaimStatus: 'updateClaimStatus',
} as const;
