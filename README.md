# Claims Management — QA Take-Home

A risk-based test suite for the demo claims application (`demo-app-qa-main/`), focused on the **Claims module**. It uses Playwright (TypeScript) for API, contract and UI tests.

| Deliverable | Where |
|-------------|-------|
| Test architecture and how to run | this README |
| Test strategy (risks, in/out of scope, test data, entry/exit, CI) | [docs/TEST_STRATEGY.md](docs/TEST_STRATEGY.md) |
| Test case design (ID, objective, steps, data, expected) | [docs/TEST_CASES.md](docs/TEST_CASES.md) |
| Defects (ID, summary, severity, status, evidence) | [docs/DEFECTS.md](docs/DEFECTS.md) |
| AI working journal | [docs/AI_JOURNAL.md](docs/AI_JOURNAL.md) |
| Automation code | [qa-tests/](qa-tests) |

---

## 1. Test architecture

```
qa-tests/
├── playwright.config.ts        # 3 projects: api, contract, ui; traces/screenshots/video on failure
├── .env.example                # ALL hosts, users, paths, timeouts — nothing hard-coded in code
├── src/
│   ├── config/env.ts           # typed, fail-fast access to .env
│   ├── constants/              # ClaimRules (business limits), status machine, API routes, HTTP codes
│   ├── api/                    # API layer ("page objects" for HTTP)
│   │   ├── api-session.ts      #   one cookie jar per user; transparent CSRF handling
│   │   ├── claims-api.ts       #   claimant endpoints
│   │   ├── admin-claims-api.ts #   admin endpoints
│   │   ├── auth-api.ts         #   registers a fresh claimant per worker
│   │   └── claim-lifecycle.ts  #   arrange: put a claim into any status via the real API
│   ├── contract/               # OpenAPI (bff-api.yml) and AsyncAPI JSON-Schema validators (Ajv)
│   ├── messaging/              # Kafka listener for event contract tests
│   ├── assertions/             # expectContractResponse / expectProblemDetail — status + schema + body
│   ├── data/                   # ClaimBuilder, boundary/partition tables derived from ClaimRules, dates
│   ├── pages/                  # UI Page Object Model
│   │   ├── base.page.ts
│   │   ├── login.page.ts, claim-wizard.page.ts, my-claims.page.ts, admin-claims.page.ts
│   │   └── components/         #   app-header, claim-detail-modal
│   ├── ui/ui-text.ts           # every UI string/label in one place
│   ├── ui/display-format.ts    # independent oracle for currency/date formatting
│   └── fixtures/               # api-fixtures (sessions, APIs) ← ui-fixtures (pages, logged-in users)
└── tests/
    ├── api/        claims-submission, claims-access-control, admin-claim-workflow
    ├── contract/   bff-openapi, claim-events (Kafka)
    └── ui/         authentication, claim-submission, admin-claims, realtime-updates
```

**Design decisions**
- **POM on both layers.**
  - UI: page objects expose intent (`wizardPage.submitClaim(claim)`) and locators; tests hold the assertions.
  - HTTP: `ClaimsApi` / `AdminClaimsApi` play the same role.
- **Accessible locators first** (`getByRole`, `getByLabel`), scoped to a container to avoid duplicates (the table and card layouts are both in the DOM). `data-testid` is used only where the app provides it.
- **No hard-coded values:**
  - URLs and credentials → `.env`
  - business limits → `ClaimRules`
  - UI copy → `ui-text.ts`
  - routes and status codes → `constants/api.ts`
  - dates → relative to today
- **Strong assertions.** Every API call asserts:
  1. the status code (the failure message includes the body),
  2. the OpenAPI schema for that (operation, status),
  3. the business values.

  UI flows are cross-checked against the API, so "the UI shows it" also means "the backend stored it".
- **Isolation.** Each worker registers its own claimant. Claims carry a unique tag, so tests never depend on pre-existing data or list position.
- **Arrange through the API, verify through the UI.** It is faster, less flaky, and keeps each UI test focused on one behaviour.
- **Data-driven boundaries.** Valid and invalid tables plus the full status-transition matrix (6 allowed + 13 forbidden pairs) are generated from the rule constants.

## 2. Running the suite

**Prerequisites:** Docker Desktop (or Podman), Java 21, Maven, Node.js 20+.

```bash
cd demo-app-qa-main
```
Set `APP_EVENTS_CDC_ENABLED: "false"` for claims-service in `docker-compose.apps.yml` to enable direct-Kafka real-time mode (see DEF-005), then:
```bash
./start-infra.sh
```
```bash
./start-app.sh
```

```bash
cd qa-tests
```
```bash
npm ci
```
```bash
npx playwright install chromium
```
Copy `.env.example` to `.env` (edit it only if your ports or users differ).

```bash
npm test
```
| Command | Runs |
|---------|------|
| `npm run test:smoke` | `@smoke` subset — the quick health gate |
| `npm run test:api` | API project |
| `npm run test:contract` | OpenAPI and Kafka contract project |
| `npm run test:ui` | Browser project (Chromium) |
| `npx playwright test --grep @security` | Security-tagged tests only |
| `npm run report` | Open the HTML report (screenshots, video, trace for failures) |

**Tags:** `@smoke @api @ui @contract @integration @claims @admin @security`.

> **Expected result:** a number of tests **fail on purpose**. Each failure corresponds to a defect in [DEFECTS.md](docs/DEFECTS.md), and the test case sheet marks those cases as "fails, DEF-xxx". They are kept red rather than skipped: the suite reports the application as it really is.

### Execution status
The suite was written and reviewed against the application source in a session where Docker and Node.js were **not available on the authoring machine**, so it has **not been executed yet**. Defects are therefore marked *Open – code-verified*: the root cause was confirmed in the source with file:line references. The first execution run should:
1. Fix any locator or typing issues.
2. Attach screenshots from `qa-tests/test-results/` to `docs/evidence/`.
3. Move the confirmed defects to *Open – reproduced*.

## 3. Overall thought process
1. **Read before testing.** I mapped all three tiers, the contracts (OpenAPI, AsyncAPI) and the compose configuration before writing a test. Most of the defects found came from reading the seams between layers: shared mutable `ApiClient`, swallowed status codes, CDC flag mismatch, schema drift.
2. **Rank risk by business impact.** Claims data integrity and the status workflow drive money and trust, so they got the deepest coverage. Dashboard, signup UX and theming were deliberately left out.
3. **Push tests down the pyramid.** About 70% of the checks are API-level: fast and deterministic, close to the logic. UI tests cover only what only the UI can show (validation copy, navigation, rendering, live updates).
4. **Treat contracts as oracles.** The app is API-first, so the published schemas are the specification. Validating every response and event against them catches drift that hand-written assertions miss.
5. **Make failures meaningful.** Each known defect has a failing test that names the expectation. Tests that could pass vacuously were removed; for example, "no toast arrived" would pass even when real-time is broken.
6. **Next steps, in priority order:**
   1. Execute the suite and attach evidence.
   2. Add a K6 concurrency test for DEF-001.
   3. Run a timezone matrix with Playwright `clock`/`timezoneId` (DEF-015).
   4. Pin the BFF ↔ claims-service contract with Pact.
   5. Wire CI per the strategy §8.
   6. Add axe accessibility checks.
