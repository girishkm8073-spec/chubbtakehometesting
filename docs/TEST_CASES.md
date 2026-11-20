# Test Cases — Claims Module

Template columns:
- **ID**
- **Objective**
- **Preconditions**
- **Test steps**
- **Test data**
- **Expected result**
- **Priority:** P1 critical, P2 high, P3 medium
- **Type:** API / UI / Contract / Integration; **BVA** = boundary value, **EP** = equivalence partition, **Neg** = negative
- **Req**
- **Automated in** (spec file)

The automated test name starts with the same ID. Data columns refer to `ClaimRules` (`qa-tests/src/constants/claim-rules.ts`) rather than hard-coded values.

## 1. Requirements (derived from bff-api.yml, domain code and UI)

| Req | Requirement |
|-----|-------------|
| REQ-01 | An authenticated claimant can submit a claim (date, location, description, amount); it starts in SUBMITTED |
| REQ-02 | Field rules: description 10–1000 characters; location 5–200 characters; amount 0.01–1,000,000 with 2 decimal places; incident date not in the future; text is trimmed |
| REQ-03 | A claimant sees only their own claims, newest first; the summary description is at most 100 characters |
| REQ-04 | A claimant cannot read another claimant's claim (403); an unknown claim gives 404 |
| REQ-05 | Only admins can list all claims and change status; filtering by status and/or userId |
| REQ-06 | Status lifecycle: SUBMITTED→{UNDER_REVIEW, REJECTED}; UNDER_REVIEW→{APPROVED, REJECTED}; APPROVED→CLOSED; REJECTED→CLOSED; CLOSED is terminal; anything else gives 400 |
| REQ-07 | Status changes are pushed in real time to the owner; new claims are pushed to admins |
| REQ-08 | API responses and Kafka events conform to the published OpenAPI and AsyncAPI contracts |
| REQ-09 | Session security: login/logout, CSRF on state changes, protected routes, no unauthenticated internals |

## 2. API — Claim submission (`tests/api/claims-submission.api.spec.ts`)

| ID | Objective | Preconditions | Test steps | Test data | Expected result | Pri | Type | Req |
|----|-----------|---------------|-----------|-----------|-----------------|-----|------|-----|
| TC-API-CLM-001 | Valid claim is created | Fresh claimant logged in | 1. POST /api/claims 2. Validate response | `ClaimBuilder.aValidClaim()` | 201; body matches ClaimResponse schema; status SUBMITTED; all fields echoed; createdAt = updatedAt ≈ now | P1 | API/Contract | REQ-01, 08 |
| TC-API-CLM-002 | Created claim is persisted | As 001 | 1. POST claim 2. GET /api/claims/{id} | Valid claim | GET body equals the POST body | P1 | API | REQ-01 |
| TC-API-CLM-003 | Text is trimmed | As 001 | POST with padded description and location | Valid claim with 2 spaces each side | Stored values have no surrounding spaces | P2 | API | REQ-02 |
| TC-API-CLM-004 | Money precision preserved | As 001 | 1. POST amount 100.999 2. GET claim | `claimAmount=100.999` | Either 400, or the stored amount equals the sent amount (no silent rounding) | P1 | API/BVA | REQ-02 |
| TC-API-CLM-010..016 | Boundaries accepted | As 001 | POST each boundary | description 10 and 1000 characters; location 5 and 200 characters; amount 0.01 and 1,000,000; date = today | 201; values persisted exactly | P1 | API/BVA | REQ-02 |
| TC-API-CLM-020..026 | Boundaries rejected | As 001 | POST each value | description 9 and 1001 characters; location 4 and 201 characters; amount 0, -0.01, 1,000,000.01 | 400 ProblemDetail (schema-valid, status echoed, detail non-empty) | P1 | API/BVA/Neg | REQ-02 |
| TC-API-CLM-030 | Future date rejected | As 001 | POST with tomorrow's date | today + 1 | 400 ProblemDetail (**fails: 500, DEF-003**) | P1 | API/Neg | REQ-02 |
| TC-API-CLM-031/032 | Blank-after-trim text rejected | As 001 | POST whitespace-only description or location | 11 / 6 spaces | 400 ProblemDetail (**fails: 500, DEF-003**) | P2 | API/EP/Neg | REQ-02 |
| TC-API-CLM-040 | Required fields enforced | As 001 | POST with each field omitted in turn (4 steps) | Valid claim minus one field | 400 for each | P1 | API/Neg | REQ-02 |
| TC-API-CLM-041 | Unauthenticated submit refused | No session | POST /api/claims | Valid claim | 401 or 403 | P1 | API/Security | REQ-09 |
| TC-API-CLM-042 | CSRF enforced | Logged in | POST without X-XSRF-TOKEN | Valid claim | 403 | P2 | API/Security | REQ-09 |
| TC-API-CLM-043 | Summary truncation | Logged in | 1. POST 1000-character description 2. GET list | Description 1000 characters | Summary = first 100 characters | P3 | API/BVA | REQ-03 |

## 3. API — Ownership and access control (`tests/api/claims-access-control.api.spec.ts`)

| ID | Objective | Preconditions | Test steps | Test data | Expected result | Pri | Type | Req |
|----|-----------|---------------|-----------|-----------|-----------------|-----|------|-----|
| TC-API-CLM-050 | Own list newest first | Fresh claimant | 1. Submit two claims 2. GET list | 2 valid claims | Both present; newer first; createdAt descending | P2 | API | REQ-03 |
| TC-API-CLM-051 | No cross-user listing | Fresh + seeded claimant | 1. Fresh claimant submits 2. Seeded claimant lists | Valid claim | Claim absent from the other list | P1 | API/Security | REQ-03 |
| TC-API-CLM-052 | Cross-user read forbidden | As 051 | Seeded claimant GETs the fresh claimant's claim | Claim id | 403 ProblemDetail (**fails: 500, DEF-002**) | P1 | API/Security | REQ-04 |
| TC-API-CLM-053 | Unknown claim | Logged in | GET random UUID | Random UUID | 404 ProblemDetail (**fails: 500, DEF-002**) | P2 | API/Neg | REQ-04 |
| TC-API-CLM-054 | Anonymous list refused | No session | GET /api/claims | — | 401 | P1 | API/Security | REQ-09 |
| TC-API-CLM-055 | Claimant blocked from admin API | Claimant logged in | 1. GET /api/admin/claims 2. PATCH own claim status | Own claim | 403 for both | P1 | API/Security | REQ-05 |
| TC-API-CLM-056 | Concurrency attribution | Two claimants | 1. 10+10 parallel POSTs, each with a unique tag 2. List mine | 20 tagged claims | Each claim is in its submitter's list only (**DEF-001 probe**) | P1 | API/Concurrency | REQ-03, 04 |
| TC-API-SEC-001 | Only health is public | — | GET /actuator (the discovery page) anonymously on :8080 and :8090 | — | No published link other than self/health (**fails: heapdump, env, loggers…, DEF-009**) | P1 | API/Security | REQ-09 |

## 4. API — Admin workflow (`tests/api/admin-claim-workflow.api.spec.ts`)

| ID | Objective | Preconditions | Test steps | Test data | Expected result | Pri | Type | Req |
|----|-----------|---------------|-----------|-----------|-----------------|-----|------|-----|
| TC-API-ADM-{FROM}-{TO} (allowed, 6 cases) | Each allowed transition works | Claim moved to FROM via API | 1. PATCH status TO 2. Owner GETs claim | `AllowedTransitions` matrix | 200 ClaimResponse; status TO; updatedAt ≥ before; createdAt unchanged; owner sees TO | P1 | API/State | REQ-06 |
| TC-API-ADM-{FROM}-{TO} (forbidden, 13 cases) | Every other transition is refused | Claim in FROM | 1. PATCH status TO 2. Owner GETs claim | Complement of the matrix (excluding the disputed pair DEF-010) | 400 ProblemDetail; status still FROM (**fails: 500, DEF-004**) | P1 | API/State/Neg | REQ-06 |
| TC-API-ADM-060 | Unknown claim | Admin | PATCH random UUID | UNDER_REVIEW | 404 ProblemDetail (**fails: empty body, DEF-021**) | P2 | API/Neg | REQ-06 |
| TC-API-ADM-061 | Unknown status value | Admin + claim | PATCH `newStatus: PAID` | Invalid enum | 400 | P2 | API/Neg | REQ-06 |
| TC-API-ADM-070 | Admin sees all | Claim by fresh claimant | GET /api/admin/claims | — | Contains the claim; schema valid | P1 | API | REQ-05 |
| TC-API-ADM-071 (×5) | Status filter | Claim in each status | GET ?status=S | Each status | Contains the claim; only status S returned | P2 | API/EP | REQ-05 |
| TC-API-ADM-072 | userId filter | Claim | GET ?userId=U | Owner id | Only U's claims | P2 | API | REQ-05 |
| TC-API-ADM-073 | Combined filter | SUBMITTED + REJECTED claims | GET ?status=REJECTED&userId=U | — | REJECTED included, SUBMITTED excluded | P3 | API | REQ-05 |
| TC-API-ADM-074 | Unfiltered list ordered | ≥2 claims | GET /api/admin/claims | — | createdAt descending (**fails, DEF-008**) | P3 | API | REQ-05 |

## 5. Contract (`tests/contract/*.contract.spec.ts`)

| ID | Objective | Preconditions | Test steps | Test data | Expected result | Pri | Type | Req |
|----|-----------|---------------|-----------|-----------|-----------------|-----|------|-----|
| TC-CON-API-001 | Login contract | Fresh claimant | POST /api/auth/login | Valid credentials | 200 UserResponse schema; role CLAIMANT; HttpOnly `access_token` cookie | P1 | Contract | REQ-08, 09 |
| TC-CON-API-002 | Login error contract | — | POST login with a wrong password | — | 401 ProblemDetail schema | P2 | Contract | REQ-08 |
| TC-CON-API-003 | 401 body contract | — | GET /api/claims anonymously | — | 401 with a ProblemDetail body (**fails: empty body, DEF-021**) | P2 | Contract | REQ-08 |
| TC-CON-API-005 | Status update contract | Claim | PATCH UNDER_REVIEW | — | 200 full ClaimResponse | P2 | Contract | REQ-08 |
| (inline) | Every success and error response in §2–4 | — | `expectContractResponse` / `expectProblemDetail` | — | Body validates against bff-api.yml for (operationId, status) | P1 | Contract | REQ-08 |
| TC-CON-EVT-001 | claim-submitted event schema | Direct-Kafka mode | 1. Subscribe to claim-events 2. Submit a claim | Valid claim | Payload validates against ClaimSubmittedMessage.json; values match the claim (**fails, DEF-006**) | P2 | Contract/Integration | REQ-08 |
| TC-CON-EVT-002 | claim-status-changed event schema | As above | 1. Submit 2. Admin → UNDER_REVIEW | — | Payload validates; old/new status correct (**fails, DEF-006**) | P2 | Contract/Integration | REQ-08 |
| TC-CON-EVT-003 | Event routable to owner | As above | As 002 | — | payload.userId = claim owner | P1 | Integration | REQ-07 |

## 6. UI (`tests/ui/*.ui.spec.ts`)

| ID | Objective | Preconditions | Test steps | Test data | Expected result | Pri | Type | Req |
|----|-----------|---------------|-----------|-----------|-----------------|-----|------|-----|
| TC-UI-AUTH-001 | Claimant login | Fresh claimant | 1. Open /login 2. Enter credentials 3. Log In | `.env` / generated | URL /claims; claimant nav visible; admin nav hidden | P1 | UI | REQ-09 |
| TC-UI-AUTH-002 | Admin login | Seeded admin | As above | ADMIN_* from .env | URL /admin/dashboard; admin nav visible | P1 | UI | REQ-09 |
| TC-UI-AUTH-003 | Wrong password | — | Log in with a wrong password | — | "Invalid email or password"; still on /login | P2 | UI/Neg | REQ-09 |
| TC-UI-AUTH-004 | Client-side email validation | — | Enter a malformed email | `not-an-email` | "Invalid email format"; no login request sent | P3 | UI/Neg | REQ-09 |
| TC-UI-AUTH-005 | Route protection | Not logged in | Visit /claims | — | Redirect to /login?redirect=… | P1 | UI/Security | REQ-09 |
| TC-UI-AUTH-006 | Logout ends session | Logged in | 1. Logout 2. Visit /claims | — | Redirected to login (**fails, DEF-011**) | P1 | UI/Security | REQ-09 |
| TC-UI-CLM-001 | Submit through wizard | Claimant logged in | 1. Step 1: date, location, amount → Next 2. Step 2: description → Next 3. Submit Claim | Valid claim | Success toast with UUID; redirect to /claims; row shows date, USD amount and "Submitted" badge; API confirms the values | P1 | UI/Integration | REQ-01 |
| TC-UI-CLM-002 | Review step accuracy | Logged in | Fill steps 1–2 | Valid claim | Review shows long date, location, USD amount, description | P2 | UI | REQ-01 |
| TC-UI-CLM-003 | Back navigation keeps data | Logged in | Fill to review → Back → Back | Valid claim | All inputs retain their values | P3 | UI | REQ-01 |
| TC-UI-CLM-010..013 | Step-1 validation | Logged in | Enter the invalid value | Tomorrow; location 4 characters; amount 0; amount max+1 | Exact error message shown; Next disabled | P1 | UI/BVA/Neg | REQ-02 |
| TC-UI-CLM-014 | Step-2 validation | Step 1 done | Description of 9 characters | 9 characters | "Description must be at least 10 characters"; Next disabled | P2 | UI/BVA | REQ-02 |
| TC-UI-CLM-015 | Whitespace description | Logged in | Submit an 11-space description | 11 spaces | Server answers 400; error mentions description (**fails, DEF-003**) | P2 | UI/Integration/Neg | REQ-02 |
| TC-UI-CLM-016 | Cancel confirmation | Step 1 typed | Click Cancel | — | Confirmation dialog shown (**fails, DEF-012**) | P3 | UI | — |
| TC-UI-CLM-020 | Detail modal | Claim created via API | Open View Details | 101-character description | Full id, location, untruncated description, USD amount, date | P1 | UI | REQ-03 |
| TC-UI-CLM-021 | List order | 2 claims via API | Reload list | — | Newer row above older | P2 | UI | REQ-03 |
| TC-UI-CLM-022 | List truncation | 1000-character claim | View list | — | Cell = first 50 characters + "..." | P3 | UI | REQ-03 |
| TC-UI-ADM-001 | Approve via UI | Claim UNDER_REVIEW | Select Approved → Confirm | — | Toast "Claim status updated to Approved"; badge Approved; API shows APPROVED | P1 | UI/Integration | REQ-06 |
| TC-UI-ADM-002 | Cancel confirmation | SUBMITTED claim | Select Rejected → Cancel | — | Dialog closes; still Submitted in UI and API | P2 | UI | REQ-06 |
| TC-UI-ADM-003 (×4) | Offered transitions | Claim in each non-terminal status | Read select options | Matrix | Options = allowed set (the disputed option tolerated) | P1 | UI/State | REQ-06 |
| TC-UI-ADM-004 | Terminal status | CLOSED claim | View row | — | "No status transitions available"; no select | P2 | UI | REQ-06 |
| TC-UI-ADM-005 | Status filter | REJECTED + SUBMITTED claims | Filter Rejected | — | Only Rejected badges; the submitted claim is hidden | P2 | UI | REQ-05 |
| TC-UI-ADM-006 | Stale update | Claim closed by another admin | Choose Under Review → Confirm | — | Table still visible; no "Failed to load claims" (**fails, DEF-004**) | P2 | UI/Neg | REQ-06 |
| TC-UI-RT-001 | Live status push to owner | Claimant on /claims | Admin changes status via API | — | Badge becomes Under Review without reload; toast shown (**fails in default compose, DEF-005**) | P1 | UI/Integration | REQ-07 |
| TC-UI-RT-002 | Live new-claim push to admin | Admin on dashboard | Claimant submits via API | — | Toast "New claim submitted: xxxxxxxx…" (**DEF-005**) | P2 | UI/Integration | REQ-07 |

## 7. Manual / exploratory charters (not automated — reason given)

| ID | Charter | Why manual |
|----|---------|-----------|
| EXP-01 | Timezone matrix: run the wizard in Asia/Kolkata (00:00–05:30) and America/New_York (evening) | Needs clock control; becomes automatable with Playwright `timezoneId` + `clock` (next step) |
| EXP-02 | Click the claimant real-time toast | Depends on DEF-005 being fixed; expected to 404 (DEF-013) |
| EXP-03 | Two admins working the same queue simultaneously | Validates the DEF-004 user experience end to end |
| EXP-04 | Keyboard-only and screen-reader pass of the wizard and admin table | Accessibility; tooling (axe) is a next step |
| EXP-05 | Mobile card layout (< md breakpoint) | Duplicate DOM; low risk; check visually |

## 8. Coverage summary

| Requirement | Automated cases | Known failing (defect) |
|-------------|-----------------|------------------------|
| REQ-01 | 6 | — |
| REQ-02 | 26 | DEF-003, DEF-007 |
| REQ-03 | 7 | DEF-001 (probe) |
| REQ-04 | 3 | DEF-002 |
| REQ-05 | 12 | DEF-008 |
| REQ-06 | 25 | DEF-004 |
| REQ-07 | 3 | DEF-005 |
| REQ-08 | all API responses + 5 | DEF-006, DEF-021 |
| REQ-09 | 9 | DEF-009, DEF-011 |
