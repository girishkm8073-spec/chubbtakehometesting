# Master QA Report

## Executive summary
This repo was assessed with a risk-first QA approach focused on the app’s most critical runtime seams: claim lifecycle, auth/session handling, and event-driven fan-out. The key backend and integration flows were validated successfully under the required Java 21 environment, and the final remaining issue was a reproducible browser smoke defect in the authenticated claims navigation flow.

The project is not failing broadly; instead, the targeted validation shows one real frontend defect in the login-to-new-claim route flow. The underlying domain logic, auth/security boundary, and Kafka/WebSocket integration checks are all passing. This gives a strong signal that the core business logic and runtime integration paths are working, while the remaining issue is localized to the browser navigation layer.

## Summary of work completed
- Assessed the app’s architecture and risk profile before adding tests.
- Focused on the highest-value risks instead of broad, low-signal coverage.
- Fixed environment/configuration issues affecting validation.
- Added targeted tests for claim creation, status transitions, auth cookies, and event consumption.
- Debugged false failures caused by environment drift and malformed JWT setup.
- Ran browser smoke tests to validate the real user journey.
- Documented the findings and the remaining defect for handoff/reporting.

## Environment and tooling fixes
### Java 21 alignment
- The repository requires Java 21.
- The shell was defaulting to a newer JDK, which caused false compile failures.
- Fixed by aligning `JAVA_HOME` and `PATH` to the installed JDK 21 before Maven-based validation.

### JWT test setup fix
- One BFF auth test was using a malformed JWT against the real filter chain.
- This caused a 401 before the controller logic could execute.
- The issue was in the test setup, not the product logic.
- Corrected by using a valid mocked JWT matching the real Spring Security flow.

### Missing import fix
- The `AuthControllerTest` suite initially failed to compile due to a missing `JwtDecoder` import.
- Added the required Spring Security JWT imports and reran the test slice.

## Test strategy and priorities
### Priority 1: claim lifecycle
- Claim creation
- Claim status transitions
- Authorization and invalid state rules
- Direct event emission when CDC is disabled

### Priority 2: auth and session boundary
- Login behavior
- Refresh token flow
- Logout cookie clearing
- Cookie-to-header JWT conversion

### Priority 3: event-driven integration
- Kafka event consumption
- CDC update handling
- WebSocket broadcast routing
- Malformed or unknown payload handling

### Priority 4: browser smoke flow
- Login and redirect to the claims area
- Navigation into the claim submission screen
- End-to-end smoke of the user journey

## Added and strengthened tests
### Claims service
- `CreateClaimUseCaseTest`
  - Verified claim creation with a valid command
  - Verified user-not-found rejection
  - Verified event publication when the claim is created
  - Verified direct event publication when CDC is disabled
  - Verified status is set to `SUBMITTED` and timestamps are populated
- `UpdateClaimStatusUseCaseTest`
  - Verified admin-only status updates
  - Verified invalid status transitions are rejected
  - Verified claim-not-found handling
  - Verified unauthorized users cannot update status
  - Verified direct status-change event publication when CDC is disabled

### BFF/auth
- `AuthControllerTest`
  - Login success behavior
  - Login cookie setting
  - Refresh token cookie refresh
  - Logout cookie clearing
  - Invalid credentials handling
  - Real JWT path in Security filter chain

### Kafka/WebSocket integration
- `ClaimEventKafkaConsumerTest`
  - Claim submitted -> admin broadcast
  - Claim status changed -> user + admin broadcast
  - CDC create/update -> correct broadcast behavior
  - Ignore malformed or unknown payloads without crashing
- `ClaimEventKafkaConsumerIntegrationTest`
  - End-to-end Kafka event consumption under embedded Kafka conditions

### Frontend smoke
- `tests/e2e/auth-login.spec.ts`
  - Login flow smoke test
  - Claim submission flow smoke test
  - Invalid credentials validation check

## Verified passing test counts by class

These are the verified passing test classes from the focused QA validation run for the app’s critical runtime seams.

| Layer | Test class | Passed test count |
|------|------------|------------------|
| Claims service | `CreateClaimUseCaseTest` | 5 |
| Claims service | `UpdateClaimStatusUseCaseTest` | 6 |
| BFF/auth | `AuthControllerTest` | 13 |
| BFF messaging | `ClaimEventKafkaConsumerTest` | 17 |
| BFF integration | `ClaimEventKafkaConsumerIntegrationTest` | 3 |
| Total passing tests | — | 44 |

Note: the browser-level smoke file `code/demo-app-ui/tests/e2e/auth-login.spec.ts` contains 3 tests, but the claim-submission smoke remains failing due to the confirmed frontend navigation bug (`/claims` stays active instead of navigating to `/claims/new`). That issue is documented separately in this report as the one remaining open defect.

## Known issues discovered
### 1. Frontend navigation defect
- Symptom: after successful login, the app stays on `/claims` instead of navigating to `/claims/new` when “Submit New Claim” is clicked.
- Impact: user cannot reach the claim submission screen from the authenticated claims page.
- Classification: frontend route/navigation issue, not a backend claim-service defect.
- Evidence: Playwright smoke test fails with expected `/claims/new`, actual `/claims`.

### 2. Environment drift
- Java version mismatch produced false compile failures.
- This was resolved by aligning the environment to JDK 21.

## What this means for repo quality
The repo’s most critical business logic and integration seams are validated and passing. The single surviving issue is a browser-layer navigation defect, which is important but limited in scope. The overall confidence is high for the core application behavior and the real runtime boundaries.

## Supporting documentation
This report is accompanied by the following supporting files:
- `docs/qa/TEST_STRATEGY_NOTES.md`
- `docs/qa/AI_WORKING_JOURNAL.md`
- `docs/qa/QA_SUMMARY.md`

These documents are intended to make the repo review easier and provide a clear narrative for interview or hiring-panel discussion.

## Bug report: Frontend navigation defect in claim creation flow

### Title
Authenticated user remains on `/claims` instead of navigating to `/claims/new` after clicking “Submit New Claim”

### Summary
After a successful login, the user is taken to the claims dashboard. When the user clicks the “Submit New Claim” button, the expected behavior is to navigate to `/claims/new` so the new claim form can be completed. Instead, the app remains on `/claims`, preventing the user from creating a new claim.

### Environment
- Frontend: Next.js 16 / React 19
- Browser validation: Playwright smoke test
- File under review: `code/demo-app-ui/app/(authenticated)/claims/page.tsx`
- Related test: `code/demo-app-ui/tests/e2e/auth-login.spec.ts`

### Steps to reproduce
1. Open the app and navigate to `/login`
2. Log in with a valid claimant user
3. Wait for the redirect to the claims list page (`/claims`)
4. Click the “Submit New Claim” button
5. Observe the resulting URL

### Expected result
The browser navigates to `/claims/new` and shows the new claim form.

### Actual result
The browser remains on `/claims`.

### Impact
- Blocks the primary business action of creating a claim
- Prevents claim submission from the authenticated user journey
- Creates a false perception that the application is not progressing after login

### Root cause indication
The issue appears localized to the frontend navigation layer rather than the backend claim-creation flow. The claims page contains the button action that triggers navigation, and the Playwright smoke test reproduced the failure reliably. The backend and related integration checks were validated successfully, which narrows the issue to the browser-side route behavior.

### Evidence
The smoke test in `code/demo-app-ui/tests/e2e/auth-login.spec.ts` asserts:
- `await expect(page).toHaveURL(/\/claims\/new$/);`

Observed actual result during run:
- URL remained `/claims`

### Severity
Medium to High — the defect blocks a core user workflow.

### Classification
Frontend bug / route navigation defect.

### Status
Confirmed and reported as a real issue in the authenticated claim submission flow.
