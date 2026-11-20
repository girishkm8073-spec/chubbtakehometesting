# Defect Log — Claims Management Application

**Severity scale:**
- **Critical:** data integrity or security breach affecting customers.
- **High:** a core Claims flow is broken or returns wrong results.
- **Medium:** a contract or behaviour deviation with a workaround.
- **Low:** cosmetic or maintainability.

**Status values:**
- **Open – code-verified:** the root cause was confirmed by reading the source (file:line given). Run evidence is still to be attached from the Playwright report.
- **Open – reproduced:** a failing test run plus a screenshot or trace is attached.
- **Query:** the requirement is unclear and needs a product owner decision.

> **Evidence / screenshots:** every defect lists the automated test that exposes it. Running `npm test` in `qa-tests/` produces, for each failing test, a screenshot, video and trace in `qa-tests/test-results/` and the HTML report (`npm run report`). Copy the screenshot into `docs/evidence/DEF-xxx.png` and change the status to *Open – reproduced*.

## Summary

| ID | Summary | Severity | Status | Area | Exposed by |
|----|---------|----------|--------|------|-----------|
| DEF-001 | Concurrent requests can run under another user's token: the BFF shares one ApiClient with a mutable bearer token | **Critical** | Open – code-verified | BFF | TC-API-CLM-056 |
| DEF-002 | GET /api/claims/{id} returns 500 instead of 403 (another user's claim) or 404 (unknown id) | High | Open – code-verified | BFF | TC-API-CLM-052, -053 |
| DEF-003 | Submitting a claim that breaks a domain rule (future date, blank text) returns 500 instead of 400 | High | Open – code-verified | BFF / claims-service | TC-API-CLM-030..032, TC-UI-CLM-015 |
| DEF-004 | An invalid status transition returns 500 instead of 400; the admin UI then hides the whole claims table | High | Open – code-verified | claims-service / BFF / UI | TC-API-ADM-*(forbidden), TC-UI-ADM-006 |
| DEF-005 | Real-time updates do not work with the documented default start-up: compose enables CDC mode without Debezium | High | Open – code-verified | Config | TC-UI-RT-001, -002, TC-CON-EVT-* |
| DEF-006 | Kafka events violate their own AsyncAPI schemas; schema validation is disabled, which hides this | Medium | Open – code-verified | claims-service | TC-CON-EVT-001, -002 |
| DEF-007 | Sub-cent claim amounts are silently rounded on save; the create response differs from the stored value | Medium | Open – code-verified | claims-service / DB | TC-API-CLM-004 |
| DEF-008 | The unfiltered admin claim list is not sorted (every filtered list is newest-first) | Medium | Open – code-verified | claims-service | TC-API-ADM-074 |
| DEF-009 | Actuator endpoints (env, heapdump, loggers…) are publicly reachable on both services | High | Open – code-verified | Security | TC-API-SEC-001 |
| DEF-010 | UNDER_REVIEW → SUBMITTED (backwards) is allowed with no stated requirement | Low | Query | Domain | (excluded from pass/fail) |
| DEF-011 | Logout does not invalidate the session: the request lacks a CSRF token, so cookies survive | Medium | Open – code-verified | UI / BFF | TC-UI-AUTH-006 |
| DEF-012 | Wizard "Cancel" discards typed but uncommitted step-1 data without confirmation | Low | Open – code-verified | UI | TC-UI-CLM-016 |
| DEF-013 | Clicking the claimant's real-time toast navigates to /claims/{id}, a route that does not exist (404) | Medium | Open – code-verified | UI | manual |
| DEF-014 | Real-time toasts show raw enum values ("UNDER_REVIEW") instead of labels | Low | Open – code-verified | UI | TC-UI-RT-001 (asserts current text) |
| DEF-015 | Date handling depends on timezone: the wizard's max date is UTC, and list dates shift by a day west of UTC | Medium | Open – code-verified | UI | manual (timezone matrix) |
| DEF-016 | The UI's REST base URL falls back to :8080 (claims-service) instead of :8090 (BFF) | Low | Open – code-verified | UI config | manual |
| DEF-017 | The BFF JWT decoder validates only timestamps — not issuer or audience | Medium | Open – code-verified | Security | manual |
| DEF-018 | Metric tags include userId/adminUserId, giving unbounded label cardinality | Low | Open – code-verified | Observability | review |
| DEF-019 | Signup name rules differ between the UI (1–255) and the contract (2–100) | Low | Open – code-verified | UI / contract | review |
| DEF-020 | Count badge reads "1 claims"; admin "View Details" is a no-op ("coming soon") | Low | Open – code-verified | UI | review |

---

## Details

### DEF-001 — Cross-user token leakage under concurrency (Critical)
- **Where:**
  - `bff-service/.../config/RestClientConfig.java:28-50` — a single `ApiClient` bean.
  - `bff-service/.../adapter/out/claimsservice/ClaimsServiceAdapter.java` — `setUserBearerToken()` calls `apiClient.setBearerToken(...)` before each call.
  - `AdminController.java` constructor — its own shared `ApiClient`, mutated per request.
- **Steps:**
  1. Log in as claimant A and as claimant B.
  2. Fire 10 + 10 concurrent `POST /api/claims` requests, each with a unique description tag.
  3. List each user's claims.
- **Expected:** every claim belongs to the user who submitted it.
- **Actual (by design of the code):** the bearer token is shared mutable state. If thread A sets its token and thread B overwrites it before A's HTTP call, A's claim is created as B (or A reads B's data). Admin calls mix the service-account token with user tokens in the same way.
- **Impact:** claims recorded against the wrong policyholder; personal data disclosure. Load makes it worse.
- **Fix:** pass the token per request (a header in a request-scoped interceptor), or build an API instance per request. Never mutate a singleton.
- **Evidence:** TC-API-CLM-056 report and screenshot (attach `docs/evidence/DEF-001.png`).

### DEF-002 — Claim read errors are swallowed into 500 (High)
- **Where:** `ClaimsServiceAdapter.getClaim()` maps 403 and 404 to `IllegalStateException`. The BFF has no handler for it → 500. The contract `bff-api.yml` documents 403 and 404 ProblemDetail.
- **Steps:**
  - (a) Claimant A requests B's claim id.
  - (b) Any claimant requests a random UUID.
- **Expected:** 403 and 404 ProblemDetail respectively.
- **Actual:** 500. The UI then shows "Failed to load claim details" instead of "You are not authorized…" or "Claim not found."

### DEF-003 — Domain validation failures surface as 500 (High)
- **Where:** `ClaimsServiceAdapter.submitClaim()` wraps every `ApiException` (including claims-service's 400) in `IllegalStateException`. The BFF schema does not check future dates or trimmed length, so these reach the domain layer.
- **Steps:**
  - `POST /api/claims` with `incidentDate` = tomorrow, OR
  - a description of 11 spaces, OR
  - a location of 6 spaces.
- **Expected:** 400 ProblemDetail, e.g. "Incident date cannot be in the future".
- **Actual:** 500. The UI shows the generic "Failed to submit claim. Please try again." with no hint of which field is wrong.

### DEF-004 — Invalid status transition → 500, and the admin table disappears (High)
- **Where:**
  - `claims-service/.../ClaimExceptionHandler.java` has no `@ExceptionHandler` for `InvalidStatusTransitionException` or `UnauthorizedException` → Spring default 500.
  - `AdminController.updateClaimStatus` only maps 400/403/404 from downstream → rethrows → 500.
  - UI: `use-admin-claims-store.ts:105-116` sets the list `error` on any update failure, and `admin/claims/page.tsx` replaces the table with "Failed to load claims".
- **Steps:**
  1. Close a claim (REJECTED → CLOSED).
  2. `PATCH .../status {newStatus: UNDER_REVIEW}`.
- **Expected:** 400 "Cannot transition from CLOSED to UNDER_REVIEW"; the table stays visible.
- **Actual:** 500; the whole claims queue is hidden until reload. This happens whenever two admins work the same claim (stale UI).

### DEF-005 — Real-time pipeline is off in the default stack (High)
- **Where:** `docker-compose.apps.yml:22` has `APP_EVENTS_CDC_ENABLED: "true"`. The README says "Mode 1: Direct Kafka (default) … `APP_EVENTS_CDC_ENABLED=false` is set by default". With CDC on, `CreateClaimUseCase` and `UpdateClaimStatusUseCase` skip publishing and wait for Debezium, which `start-app.sh` does not start.
- **Steps:**
  1. `./start-infra.sh && ./start-app.sh`.
  2. A claimant opens My Claims.
  3. An admin changes the claim's status.
- **Expected:** the claimant's badge updates live and a toast appears.
- **Actual:** nothing until a manual refresh. The "Live" indicator is still green, because the socket is connected but no events flow.

### DEF-006 — Kafka message contract drift (Medium)
- **Where:** `KafkaDomainEventPublisher.buildEnvelope()`.
  - The claim-submitted payload has only `claimId`, `userId` and `correlationId`. `ClaimSubmittedMessage.json` requires `eventId`, `incidentDate`, `claimAmount` and `occurredAt`.
  - The status-changed payload lacks `eventId` and `occurredAt`.
  - `KafkaMessageSchemaValidator` validates the **whole envelope** against the **payload** schema, so enabling validation (`kafka.producer.schema-validation.enabled`, currently `false`) would reject every event.
- **Impact:** any consumer generated from the AsyncAPI contract breaks. The disabled guard hides the drift.

### DEF-007 — Money silently rounded (Medium)
- **Where:**
  - `Claim.java:90-93` accepts any positive `BigDecimal`.
  - The DB column is `claim_amount DECIMAL(12,2)` (`002-create-claims-table.yaml`).
  - The OpenAPI schema has no `multipleOf: 0.01`.
  - The UI wizard has `noValidate`, so `step=0.01` is not enforced.
- **Steps:**
  1. Submit `claimAmount: 100.999`.
  2. `GET` the claim.
- **Expected:** a 400 error, or the amount stored exactly.
- **Actual:** the POST response says 100.999; the stored and fetched value is 101.00.

### DEF-008 — Admin "all claims" unordered (Medium)
- **Where:** `ClaimRepositoryAdapter.findAll()` uses `jpaRepository.findAll()` with no sort. Every other query has `ORDER BY createdAt DESC`, and the use-case Javadoc promises "sorted by createdAt DESC".
- **Impact:** the newest claims are not reliably at the top of the adjuster queue.

### DEF-009 — Actuator exposed without authentication (High, security)
- **Where:** both `application.yml` files set `management.endpoints.web.exposure.include: '*'`. Both `SecurityConfig` classes set `.requestMatchers("/actuator/**").permitAll()`. Compose publishes ports 8080 and 8090.
- **Steps:** `GET http://localhost:8080/actuator/env` and `/actuator/heapdump` without a token.
- **Expected:** 401/404 — only `health` should be public.
- **Actual:** configuration, environment and heap memory (which can contain tokens and DB credentials) are readable, and `/actuator/loggers` can be changed.

### DEF-010 — Backward transition UNDER_REVIEW → SUBMITTED (Query)
- **Where:** `ClaimStatus.canTransitionTo` and the UI's `claim-status-transitions.ts` both allow it.
- **Question for the product owner:** is "send back to submitted" a real business action? If so, who is notified, and does the claimant see it? Until answered, the automated suite asserts neither outcome.

### DEF-011 — Logout leaves a valid session (Medium)
- **Where:** `app-header.tsx:19-22` sends `POST /api/auth/logout` without `X-XSRF-TOKEN`. `/api/auth/logout` is not in the BFF's CSRF-ignore list, so the BFF answers 403 and never clears the cookies. The UI clears local state and redirects anyway.
- **Steps:**
  1. Log in.
  2. Log out.
  3. Navigate to `/claims`.
- **Expected:** redirect to login.
- **Actual (predicted from the code):** the middleware sees the surviving `access_token` cookie and lets the user in. On a shared computer the next person inherits the session.

### DEF-012 — Unsaved wizard data lost without confirmation (Low)
- **Where:** `claims/new/page.tsx:18-20` only asks for confirmation when step data was already committed with "Next".

### DEF-013 — Toast links to a missing page (Medium)
- **Where:** `use-claim-realtime-handler.ts:70` pushes `/claims/{id}`. There is no such route; details open as a modal on `/claims`.

### DEF-014 — Raw enums in notifications (Low)
- **Where:** `use-claim-realtime-handler.ts:59,66` use `newStatus` directly instead of `STATUS_LABELS`.

### DEF-015 — Timezone-dependent dates (Medium)
- **Where:**
  - `wizard-step-1.tsx:37` computes `max` from the UTC date. In IST between 00:00 and 05:30 "today" is not selectable; in US evenings "tomorrow" is.
  - `formatting.ts:7-12` and `new Date('YYYY-MM-DD')` parse as UTC midnight, then format in local time. West of UTC the incident date displays one day early.
  - The backend checks against the server's `LocalDate.now()`.
- **Next step:** run the UI project with `timezoneId` set to `America/New_York` and `Asia/Kolkata`.

### DEF-016 — Wrong default backend port in the UI (Low)
- **Where:** `bff-client.ts:19` falls back to `http://localhost:8080` (claims-service) instead of the BFF on 8090. Running the UI outside Docker without `NEXT_PUBLIC_BFF_URL` breaks every call.

### DEF-017 — JWT issuer/audience not validated in the BFF (Medium, security)
- **Where:** `SecurityConfig.jwtDecoder()` sets only a `JwtTimestampValidator`. Any token signed by the realm's keys, for any client or audience, is accepted.

### DEF-018 — High-cardinality metrics (Low)
- **Where:** `CreateClaimUseCase` and `UpdateClaimStatusUseCase` tag counters with `userId`/`adminUserId`, giving one time series per user.

### DEF-019 / DEF-020 — Minor UI and contract inconsistencies (Low)
- Signup name length: UI 1–255 versus contract 2–100.
- "1 claims" pluralisation on the admin page.
- Admin "View Details" button only shows "Details view coming soon".
