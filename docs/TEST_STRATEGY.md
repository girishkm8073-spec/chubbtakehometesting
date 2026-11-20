# Test Strategy — Claims Management Application

**Application under test:** `demo-app-qa-main` — Next.js 16 UI (:3001) → Spring Boot BFF (:8090) → Spring Boot claims-service (:8080) → PostgreSQL; Kafka + WebSocket for real-time updates; Keycloak for auth.
**Focus:** the **Claims module** (submit, view, admin review/status workflow, real-time status updates).
**Approach:** risk-based. Read the code first, rank risks, then test where a defect would hurt most.

> Note: the brief describes an Angular frontend; the supplied UI is **Next.js/React**. Tests target what was actually shipped.

---

## 1. Risk assessment (ranked)

Risk = impact × likelihood. Likelihood comes from code-review evidence, not guesswork.

| # | Risk area | Why it matters | Evidence from code review | Risk |
|---|-----------|----------------|---------------------------|------|
| R1 | **Cross-user data integrity in the BFF** | A claim filed under the wrong customer, or one customer reading another's claim, is a regulatory and trust failure. | The BFF uses **one shared `ApiClient` bean** and calls `setBearerToken()` per request (`ClaimsServiceAdapter`, `AdminController`). Under concurrency, request A can be sent with user B's token. | **Critical** |
| R2 | **Claim status workflow** (SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → CLOSED) | It drives payouts; an illegal transition, or an error that hides the queue, blocks adjusters. | Invalid transitions throw `InvalidStatusTransitionException`, which **no handler maps** → 500 (the contract says 400). The UI then hides the whole admin table on any update error. | **High** |
| R3 | **Error propagation BFF ↔ claims-service** | The UI can only show helpful messages if errors keep their status code. | `ClaimsServiceAdapter` wraps every `ApiException` in `IllegalStateException` → **403/404/400 become 500**. | **High** |
| R4 | **Claim input validation and money precision** | Wrong amounts mean wrong payouts. | Rules are duplicated in three places (UI zod, OpenAPI, domain) and differ: trimming, UTC vs local date, and the 2-decimal scale (DB `DECIMAL(12,2)` silently rounds). | **High** |
| R5 | **Real-time pipeline** (claims-service → Kafka → BFF → WebSocket → UI) | Customers and adjusters rely on live status. Four hops make it the most brittle integration. | `docker-compose.apps.yml` sets `APP_EVENTS_CDC_ENABLED=true` while the README says direct Kafka is the default. Published events do not match their AsyncAPI schemas. | **High** |
| R6 | **AuthN/AuthZ and service hardening** | Claims hold personal data. | Ownership is checked only in `GetClaimUseCase`. Actuator `include: '*'` with `permitAll` on both services. The JWT decoder validates timestamps only. Logout lacks a CSRF header. | **High** |
| R7 | UI presentation (formatting, truncation, sorting) | Visible defects erode trust but rarely lose money. | Timezone-dependent date display; raw enums in toasts; "1 claims". | Medium |
| R8 | Dashboard / cache / user admin | Internal tooling only. | — | Low |

## 2. Scope

### In scope (prioritised)
1. **API tests (BFF)** for every Claims endpoint: success paths, boundary values, domain-rule violations, ownership/role enforcement, CSRF, ordering and filters, and a concurrency probe for R1.
2. **Contract tests:**
   - Every BFF response is validated against `bff-api.yml` (the API-first source the UI client is generated from).
   - Kafka events are validated against the AsyncAPI JSON Schemas.
3. **UI tests (Playwright + POM)** for the claimant journey (login → wizard → list → detail), the admin journey (filter → change status with confirmation), and the real-time push to both roles.
4. **Code review findings** logged as defects with file and line references.

### Out of scope (deliberate, with reason)
| Area | Reason |
|------|--------|
| Signup UX, theme picker, admin users page, dashboard cache demo | Not part of the Claims module; low business risk. Signup is used only as a data-setup step. |
| Backend unit tests (JUnit) | The repo already ships extensive unit tests for both services. Extra value is lower than black-box integration coverage of the seams where the defects actually are. |
| Debezium/CDC mode | Optional mode. Covered by review only (it is the root of DEF-005). |
| Cross-browser and mobile layouts | The table and card layouts duplicate the DOM; desktop Chromium covers the logic. Firefox/WebKit are a one-line project addition. |
| Load testing (K6) | Bonus item. The concurrency defect R1 is probed functionally by TC-API-CLM-056; a K6 script is the first "next step". |
| Visual regression | Bonus item. Low value until functional defects are fixed. |
| Keycloak, token refresh, session expiry | Owned by the IdP; refresh is exercised implicitly. |

## 3. Test levels (pyramid)

```
              ┌──────────────────────┐
              │ UI E2E  (~20)        │  user journeys + real-time, POM, data arranged via API
              ├──────────────────────┤
              │ Contract (~8)        │  OpenAPI response schemas, AsyncAPI event schemas
              ├──────────────────────┤
              │ API integration (~70)│  boundaries, authZ, workflow matrix, concurrency
              ├──────────────────────┤
              │ Unit (existing)      │  shipped with the app (JUnit 5 / Vitest)
              └──────────────────────┘
```
Most new tests sit at API level: they are fast and deterministic, and that is where the riskiest logic lives. UI tests only cover what is unique to the UI (validation messages, navigation, rendering, live updates). Their preconditions are created through the API.

## 4. Test data strategy
- **No shared mutable data.** Each Playwright worker registers its **own fresh claimant** via `/api/auth/signup`, so "my claims" assertions never depend on what else is in the database.
- The **seeded users** (`admin@demo.com`, `claimant@demo.com`) come from `.env`, never from code. The seeded claimant plays "the other user" in ownership tests.
- `ClaimBuilder` generates valid claims carrying a **unique tag** (`QA-xxxxxxxx`) in the description, so a test finds its own row regardless of list position.
- **Boundary and partition data** (`claim-boundaries.ts`) is derived from a single `ClaimRules` constant: 10/1000 characters, 5/200 characters, 0.01 to 1,000,000. One edit updates every test.
- **Dates are relative to today** (`dateDaysFromToday`) — no hard-coded calendar dates.
- **Status preconditions** are created through the real admin API (`ClaimLifecycle.submitInStatus`), never by writing to the database.
- **No clean-up is required:** data is append-only and uniquely tagged. A clean slate is `./stop-infra.sh -v`.

## 5. Environments and entry/exit criteria

**Environment:** local Docker Compose stack (`start-infra.sh`, `start-app.sh`). The direct-Kafka mode is needed for real-time and event tests (`APP_EVENTS_CDC_ENABLED=false`; see DEF-005).

| Entry criteria | Exit criteria |
|----------------|---------------|
| All containers are healthy (`/actuator/health` = UP on :8080 and :8090) | 100% of P1 test cases executed |
| Seeded users can log in | No open Critical defects; every High defect fixed or explicitly accepted by the product owner |
| `qa-tests/.env` is configured | Every failure is either a logged defect or fixed in the test |
| Smoke subset (`npm run test:smoke`) is green | Traceability: every in-scope requirement has at least one test (see TEST_CASES.md) |

## 6. Traceability
Requirement IDs (REQ-xx) are defined in [TEST_CASES.md](TEST_CASES.md) §1. Each test case links to a requirement. Each automated test name starts with its test case ID (`TC-API-CLM-001 …`), so the HTML report, the test case sheet and the defect log cross-reference each other.

## 7. Defect management
Defects are logged in [DEFECTS.md](DEFECTS.md). Each entry has an ID, summary, severity (Critical/High/Medium/Low), status, steps, expected vs actual, evidence (code reference, plus a screenshot or trace from the Playwright report) and the test that exposes it. **A failing test that exposes a known defect stays failing.** It is not skipped or softened, because a green build that hides a bug is worse than a red one.

## 8. CI/CD plan
1. On every PR:
   - Spin up the Compose stack.
   - Wait on the health endpoints.
   - Run `npm run test:smoke`, then the `api` and `contract` projects (a few minutes).
2. Nightly: the full suite, including `ui`, with `CI=true` (1 retry; traces, video and screenshots on failure). Publish the HTML report and JUnit XML.
3. Quality gate: any failure blocks merge, unless it is linked to an open, accepted defect ID in the test annotation.
4. A schema-change gate: a PR that changes `bff-api.yml` or `asyncapi/schemas/*` must run the `contract` project.

## 9. Assumptions and known limitations
- The intended status lifecycle follows `ClaimStatus.canTransitionTo` and the UI's transition table. The backward **UNDER_REVIEW → SUBMITTED** move has no stated requirement. It is raised as a query (DEF-010) and excluded from automated pass/fail until the business decides.
- The time budget was 2–3 hours, so breadth was traded for depth on the Claims module.
