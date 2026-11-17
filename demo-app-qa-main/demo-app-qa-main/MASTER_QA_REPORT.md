# Master QA Report

Last updated: 17-Nov-2026

## Executive summary
The claims app was assessed with a risk-first approach focused on three runtime seams: the claim lifecycle, auth/session handling, and event-driven fan-out (Kafka to WebSocket).

The provided zip already shipped with a large unit and component suite (about 680 tests). My work was to:
- read the code and rank the risks,
- strengthen the existing tests on the highest-risk paths where their assertions were weak,
- add user-journey tests (a login component test and a Playwright smoke flow), and
- triage every failure before calling it a bug.

Result: all backend tests pass. Two UI tests fail and point at a real mismatch in how the theme is saved (finding F1). A navigation "bug" I first reported turned out to be a test timing problem. It is withdrawn, and the triage is written up below because the reasoning matters.

## Current results (run on 17-Nov-2026, Java 21, Node 24)

| Suite | Command | Total | Passed | Failed |
|---|---|---|---|---|
| claims-service (JUnit) | `mvn test` | 199 | 199 | 0 |
| bff-service (JUnit) | `mvn test` | 215 | 215 | 0 |
| UI unit/component (Vitest) | `npm run generate:api && npm test` | 270 | 268 | 2 (F1) |
| UI smoke (Playwright) | `npx playwright test --project=chromium` | 3 | 3 | 0 (stable over 3 repeats) |

Not run: tests tagged `integration` (for example `ClaimEventKafkaConsumerIntegrationTest`, `ClaimRepositoryIntegrationTest`). They use Testcontainers, need Docker, and are excluded from `mvn test` by default (`surefire.excludedGroups=integration`). Run them with `mvn test -Dgroups=integration -Dsurefire.excludedGroups=` on a machine with Docker.

## What I changed versus the provided zip

### Existing tests strengthened (5 files)

| File | Change |
|---|---|
| `claims-service/.../CreateClaimUseCaseTest` | Builds the use case with its real constructor, including `ApplicationEventPublisher`. Verifies that `ClaimSubmitted` is published. New test: direct publication when CDC is disabled. |
| `claims-service/.../UpdateClaimStatusUseCaseTest` | Same constructor fix. New test: `ClaimStatusChanged` is published directly when CDC is disabled. |
| `claims-service/.../KafkaDomainEventPublisherTest` | Uses a real `ObjectMapper`, so the test checks the actual Kafka payload (`eventType`, `claimId`, `newStatus`). The old version only checked a string that a mock returned. |
| `bff-service/.../AuthControllerTest` | New tests: login sets both auth cookies; logout clears both cookies (`Max-Age=0`) through the real JWT filter chain. The existing refresh test now also checks the new cookies. |
| `demo-app-ui/.../wizard-step-2.test.tsx` | Character-counter tests use `fireEvent.change` instead of typing 950 characters key by key, which was slow and flaky. |

### New tests (2 files, 7 tests)

| File | Tests |
|---|---|
| `demo-app-ui/src/features/auth/components/login-page.test.tsx` | 4 tests: empty-input validation, invalid credentials, successful login stores the user, and the session-expired message. |
| `demo-app-ui/tests/e2e/auth-login.spec.ts` | 3 tests: login success, full claim submission (login, then the 3-step wizard, then the POST body is checked), and invalid credentials. |

### Test support
- `tests/setup.ts`: in-memory `localStorage`/`sessionStorage` for Vitest, so the store tests don't depend on the jsdom or Node storage implementation.

### Application code
None. An earlier draft changed four app files (`claims/page.tsx`, `claims-empty-state.tsx`, `use-auth-store.ts`, `use-theme-store.ts`) to make tests pass. Those changes were reverted: QA must not change product code to turn a test green. Doing so had also hidden finding F1.

## Test strategy and priorities
Full notes: `docs/qa/TEST_STRATEGY_NOTES.md`.

1. **Claim lifecycle** (money and legal record): creation, status transitions, admin-only rules, event emission with and without CDC.
2. **Auth/session boundary** (security): login, refresh, logout cookie handling, cookie-to-JWT conversion.
3. **Event-driven integration** (most brittle seam): Kafka consumption, CDC handling, WebSocket routing, malformed payloads.
4. **User journey smoke** (UI to API contract): login and claim submission through the real UI.

## Findings

### F1. Theme preference is saved per tab, but the tests expect it to persist — open, needs product decision
- **Where:** `src/features/theme/stores/use-theme-store.ts` saves to `sessionStorage`. `tests/unit/use-theme-store.test.ts`, which came with the zip and is unchanged, expects `localStorage`.
- **Effect:** a user's theme and dark-mode choice is lost when they close the tab or open the app in a new tab.
- **Evidence:** 2 Vitest failures: `persists theme to localStorage when changed` and `persists isDark to localStorage when toggled`.
- **Open question:** there is no written spec. The test is the only stated intent. If session-only is intended, the test is wrong. If not, this is a bug. The tests are left failing on purpose until that is decided.
- **Severity:** Low (preference only, no data loss).

### F2. Claims page shows "No claims yet" before the claims have loaded — low
- **Where:** `use-claims-store.ts` starts with `isLoading: false` and `claims: []`, so the server-rendered page shows the empty state. The fetch only starts after hydration.
- **Effect:** a user who has claims briefly sees "No claims yet" and the "Submit Your First Claim" button. Buttons on the page do nothing until hydration finishes.
- **Evidence:** Playwright trace: the "No claims yet" heading was visible at 4.28 s and the `GET /api/claims` response arrived at 4.95 s.
- **Suggested fix (for devs):** start with `isLoading: true`, or render the skeleton until the first fetch completes.
- **Severity:** Low (cosmetic, misleading for a moment).

### F3. Quality concern in the provided suite: a test that cannot fail
- `use-theme-store.test.ts` › `restores theme from localStorage on initialization` writes a value to `localStorage` and reads the same value back. It never touches the store, so it passes whatever the app does. It should rehydrate the store (`useThemeStore.persist.rehydrate()`) and assert on the store state.

### Withdrawn: "Submit New Claim stays on /claims"
- **First report:** the Playwright smoke test clicked "Submit New Claim" and the URL stayed `/claims`. This was logged as a medium/high navigation bug.
- **Triage:**
  1. Clicked after the page finished loading, the button navigates correctly every time.
  2. The test clicked as soon as the URL changed. In dev mode, the server-rendered button is visible before React attaches its click handler, so the click was lost.
  3. Waiting for the "No claims yet" heading was not enough either: that heading is server-rendered too (see F2).
- **Fix (script):** the test now waits for the `GET /api/claims` response, which only fires once the page is live, before clicking. It also targets the wizard's "Submit Claim" button inside `<main>`, because the header has a button with the same name.
- **Verdict:** script issue, not an application bug. Now passes 3 of 3 repeats.

## Known test limitations
- Playwright tests mock the BFF in the browser (`page.route`). They test the UI against the API contract, not against the Docker Compose stack. A run against the real stack is the next step (see strategy notes).
- The mocked login response sends two `Set-Cookie` values in one header, so only `access_token` is actually set in the browser. The middleware only needs one cookie, so the flow still works. The test should set cookies with `context.addCookies` to be exact.

## Supporting documents
- `docs/qa/TEST_STRATEGY_NOTES.md`: risks, what was tested, what was left out and why.
- `docs/qa/AI_WORKING_JOURNAL.md`: what AI suggested, and what was accepted, challenged or overridden.
