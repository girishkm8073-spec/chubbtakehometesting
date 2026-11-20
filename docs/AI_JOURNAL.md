# AI Working Journal

**Tool:** Claude Code (Claude Opus 5.5) in the desktop app, plus one read-only sub-agent that mapped the UI source.
**How I used it:** I directed the work (scope, priorities, rubric gaps from a previous attempt, house rules: Claims first, POM, strong assertions, no hard-coded values). The AI did most of the code reading and generation. Each entry below records what was **accepted**, **challenged** or **overridden**, and why.

| # | Step | AI proposal / output | Decision | Reasoning |
|---|------|----------------------|----------|-----------|
| 1 | Kick-off | Start writing tests from the brief | **Overridden** | Previous feedback: the earlier attempt tested the wrong app and never ran anything. I required a code review and risk ranking first, and a focus on the real Claims app. |
| 2 | Tech stack | The brief says Angular | **Challenged** | The source is Next.js 16 / React 19. Locators and tooling target what was actually shipped; the mismatch is noted in the strategy. |
| 3 | Code review | AI flagged the shared `ApiClient` with `setBearerToken()` per request as a race condition | **Accepted after verification** | Confirmed in `RestClientConfig` (singleton bean) and `ClaimsServiceAdapter`/`AdminController`. Logged as Critical DEF-001, with a concurrency probe test. |
| 4 | Code review | AI listed 23 UI issues from the sub-agent | **Partially accepted** | Kept the ones with business impact and a file:line (logout CSRF, toast route, timezone, error hides table). Dropped cosmetic or speculative ones (console.log, dead catch blocks) from the defect log. |
| 5 | Status machine | AI's first oracle marked UNDER_REVIEW → SUBMITTED as a defect, so the test would fail | **Overridden** | Backend and UI both deliberately allow it, and no requirement says otherwise. Asserting either way is indefensible, so it is a *query* (DEF-010), excluded from pass/fail via `DisputedTransitions`. |
| 6 | Money precision test | AI asserted only on the POST response | **Challenged → changed** | The POST response comes from the in-memory entity; the DB column is DECIMAL(12,2). The test now re-reads with GET, otherwise it would pass while the stored value is wrong. |
| 7 | Real-time negative test | AI wrote "another user's claim produces no toast" using a fixed wait | **Overridden (removed)** | It passes vacuously whenever real-time is broken (which it is by default — DEF-005). Replaced with a positive admin-notification test. |
| 8 | Contract test | AI added "returned status code is documented" for a 200 | **Overridden (removed)** | It always passes and adds no confidence. |
| 9 | Hard-coded values | Several generated specs used literal `'/api/claims'`, `'APPROVED'`, `.slice(0, 8)`, a status regex | **Challenged → fixed** | Replaced with `ApiRoutes`, `ClaimStatus`, `MyClaimsText.claimIdPrefixLength` and `statusBadgeName()` to honour the no-hard-coding rule. |
| 10 | Pointless assertions | Generated tests contained `expect(session).toBeTruthy()` just to "use" a fixture | **Overridden** | It asserts nothing. Removed; fixtures are requested by name only. |
| 11 | Test data | AI suggested using the seeded claimant for everything | **Challenged → changed** | Shared users make "my claims" assertions order- and data-dependent. Each worker now signs up its own claimant; the seeded claimant is only "the other user". |
| 12 | UI login | Inject cookies through `storageState` for speed | **Rejected** | The sub-agent found the header and WebSocket depend on a localStorage flag as well. Cookie injection would silently disable real-time. Login goes through the real form. |
| 13 | Locators | Use `getByLabel('Password')` | **Challenged → fixed** | The show/hide toggle is also labelled "… password", so it is ambiguous. Changed to `exact: true`. Table locators are scoped to `getByRole('table')` because mobile cards duplicate the DOM. |
| 14 | Kafka contract | AI proposed validating the whole message | **Changed** | The producer wraps the payload in an envelope; the schemas describe the *payload*. Validate `payload`, and log the validator's own envelope-vs-payload bug (DEF-006). |
| 15 | Wizard cancel test | Expected a confirmation dialog after typing on step 1 | **Accepted, knowing it fails** | Losing typed data without warning is a real UX defect (DEF-012). The test stays red to document it. |
| 16 | Execution | — | **Limitation acknowledged** | Docker and Node were not installed on the authoring machine. I chose to finish a complete, reviewed suite and documentation rather than half-test locally, and to state clearly that nothing has been run yet. Defects are "code-verified" until a run attaches evidence. |
| 17 | Scope cuts | AI offered JUnit tests, K6 and visual regression | **Deferred** | The repo already ships unit tests; K6 and visual regression are bonus items. Time went to the Claims API, contracts and E2E, where the defects are. Listed as next steps. |

### Self-audit pass ("are these really app bugs, not our misses?")
I asked the AI to re-trace every defect end to end and to look for evidence that would *disprove* it, then to audit our own scripts for false-failure risks.

| # | Finding | Decision | Reasoning |
|---|---------|----------|-----------|
| 18 | DEF-009 claimed `/actuator/env` leaks values | **Corrected** | Spring Boot masks env values unless `show-values` is set (it isn't). The real leak is `/heapdump`. The test now checks the actuator discovery page instead of `/env`. |
| 19 | DEF-013 claimed the toast navigates to a 404 | **Corrected** | react-hot-toast has no `onClick` option, so clicking does nothing. Severity lowered to Low. |
| 20 | Our admin API session was worker-scoped | **Script bug — fixed** | The BFF `access_token` cookie expires after 5 minutes, so long runs would have produced false 401s. The session is now per test. |
| 21 | Test dates used the laptop's local timezone | **Script bug — fixed** | The server uses UTC `LocalDate.now()`. In IST 00:00–05:30, "today" is a future date for the server, so the boundary test would fail falsely. Dates and the browser now use `TEST_TIMEZONE` (UTC). |
| 22 | POST and GET timestamps were compared as exact strings | **Script risk — fixed** | POST echoes the in-memory Instant; GET returns the Postgres TIMESTAMP (microseconds). Timestamps are now compared at millisecond precision. |
| 23 | 401/404 tests expected a ProblemDetail body | **Kept; new defect DEF-021** | The contract documents a body, but the BFF sends an empty one. The failure is the app's fault, so it is now logged rather than left unexplained. |
| 24 | DEF-001 probe could pass despite the bug | **Documented** | A race test only proves presence, never absence. Noted in the defect; K6 is the follow-up. |

## What I would tell the panel about working with AI here
- The AI was fastest at **reading across tiers** and spotting seam bugs (token race, swallowed status codes, CDC flag). Every one was verified in the source before logging.
- Its weakest output was **assertion quality**: vacuous checks, fixture "usage" asserts, single-source checks of persisted data. Most of my overrides were there.
- Rule applied throughout: a failing test must mean the application is wrong, not the test.

## Candidate sign-off
- [ ] I have read every spec and page object and can defend each assertion.
- [ ] I have executed the suite against the Compose stack and attached the evidence in `docs/evidence/`.
- Notes / further overrides from my own review:
