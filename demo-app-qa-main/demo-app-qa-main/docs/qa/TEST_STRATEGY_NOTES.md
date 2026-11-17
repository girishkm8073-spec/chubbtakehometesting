# Test Strategy Notes

Working notes, not a formal test plan. The results and findings are in `MASTER_QA_REPORT.md`.

## The app in one paragraph
A Next.js UI talks only to a Spring Boot BFF. The BFF owns auth (Keycloak tokens stored in HttpOnly cookies) and calls claims-service over REST. Claims-service stores claims in Postgres and emits domain events to Kafka, either directly or through CDC (Debezium) when CDC is enabled. The BFF consumes those events and pushes them to browsers over WebSocket.

## Highest-risk areas and why

| Rank | Area | Why it is risky |
|---|---|---|
| 1 | Claim lifecycle (create, status transitions, admin-only updates) | It is the core business record. A wrong status or an unauthorised change is a financial and legal problem. The transition rules are real branching logic. |
| 2 | Auth/session in the BFF (login, refresh, logout, cookie-to-JWT) | It is the security boundary. A mistake here leaks access or logs users out. Cookie flags and the token refresh path are easy to break silently. |
| 3 | Event fan-out (claims-service to Kafka to BFF to WebSocket) | The most brittle seam: two delivery paths (direct and CDC), JSON contracts between services, and a malformed message must not crash the consumer. |
| 4 | UI journey (login, then claim wizard, then POST) | The UI is the only place where the whole contract is used together. Field names and date formats can drift from the API. |
| 5 | Admin dashboard stats and cache | Lower risk: read-only and recoverable. |

## What I tested
- **Unit (claims-service):** the create and update-status use cases, built with their real constructors. Event publication in both CDC modes. The Kafka publisher, with a real `ObjectMapper` so the actual payload is checked.
- **Slice (bff-service, `@WebMvcTest`):** auth controller cookie behaviour through the real security filter chain, with a mocked `JwtDecoder`.
- **Component (UI, Testing Library):** the login page from the user's side: validation, a server error, success, and session expiry.
- **E2E smoke (Playwright):** login and full claim submission, with the BFF mocked at the browser network layer. The test checks the POST body the UI sends.

## What I deliberately left out (and why)
- **Admin user management, dashboard UI and theme switching UI:** lower business risk, and the zip already covers them with unit tests.
- **Load testing (k6) and visual regression:** bonus items. Not worth it before the functional seams are trusted.
- **Testcontainers integration tests:** they exist in the zip (Postgres, Kafka) but need Docker, which was not available on the machine I used. They are documented as not run rather than reported as passing.
- **Real-stack E2E (Docker Compose with Keycloak):** this would need seeded users and a running stack. The mocked smoke test proves the UI against the contract. A real-stack run is next.

## Issues found
See `MASTER_QA_REPORT.md`:
- F1: theme saved per tab, but tests expect it to persist.
- F2: "No claims yet" shown before the claims load.
- F3: a provided test that cannot fail.
- One withdrawn false positive (navigation), with the triage written up.

## Failure triage rule I used
Before calling anything a bug, each failure was sorted as one of:
- **script:** the test is wrong,
- **application:** the app differs from the stated intent and fails again on a rerun,
- **environment:** JDK version, Docker, generated code.

The navigation "bug" was re-sorted from application to script after debugging.

## Next, with more time (in priority order)
1. Run the tagged integration tests with Docker (Kafka round trip, Postgres repository).
2. Run the Playwright journey against the real Docker Compose stack with seeded Keycloak users, for both roles (claimant and admin).
3. Admin status-change journey: admin updates a claim, and the claimant sees it live over WebSocket. This is the end-to-end proof of the event seam.
4. Contract tests between the BFF and claims-service (the OpenAPI specs already exist).
5. k6 load test on `POST /api/claims` and the WebSocket fan-out.

## How to run
```bash
# Backend (Java 21)
cd code/claims-service && mvn test
cd code/bff-service && mvn test
# Integration tests (needs Docker)
mvn test -Dgroups=integration -Dsurefire.excludedGroups=

# UI (Node 20+)
cd code/demo-app-ui
npm ci
npm run generate:api      # generates the API client; required before tests
npm test                  # Vitest
npx playwright install chromium
npx playwright test --project=chromium
```
