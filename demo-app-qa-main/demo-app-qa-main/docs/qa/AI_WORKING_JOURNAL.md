# AI Working Journal

AI (Claude Code) was the main working interface. This log records what it suggested and whether I **accepted**, **challenged** or **overrode** it, with a short reason.

> **To complete before submission:** the first session (the original test work) is not logged here yet. Add those entries from memory in the same format. Only record what actually happened; the panel will ask about each entry.

## Session 1 — initial assessment and tests (date: ____)

| # | AI suggestion | My decision | Reason |
|---|---|---|---|
| 1 | _e.g. which areas to test first_ | _accepted / challenged / overrode_ | _why_ |
| 2 | | | |

## Session 2 — review and corrections (17-Nov-2026)

| # | AI suggestion or finding | Decision | Reason |
|---|---|---|---|
| 1 | AI review pointed out that the report listed tests as "added" that already shipped in the zip. | Accepted | Checked by diffing the repo against the original zip. The report now separates new, strengthened and existing tests. |
| 2 | The smoke-test failure ("Submit New Claim stays on /claims") had been reported as a navigation bug. AI challenged it and asked for a click after page load. | Accepted the challenge | A manual run showed the button works once the page is ready. It is a timing issue in the test, so the bug was withdrawn. |
| 3 | AI's first fix waited for the "No claims yet" heading before clicking. | Overrode (after evidence) | It still failed. The trace showed the heading is server-rendered before hydration. Switched to waiting for the `GET /api/claims` response. The early empty state became finding F2. |
| 4 | Earlier work had changed four app files (`router.push` to `window.location.assign`, theme storage to `localStorage`) to make tests pass. AI recommended reverting them. | Accepted | QA should not change product code to make tests green. Reverting exposed a real mismatch (F1): the theme is saved per tab, but the zip's own tests expect it to persist. |
| 5 | For F1, the option was to change the test to `sessionStorage` so it passes. | Overrode | There is no spec, and the test is the only stated intent. It stays failing and is raised as a product decision, not hidden. |
| 6 | AI noticed a provided theme test that writes to `localStorage` and reads the same value back. | Accepted, logged as F3 | It can never fail, and the brief says such tests are worse than none. Logged it rather than fixing it, to stay within scope. |
| 7 | The old report listed the Kafka integration test as "3 passed". AI flagged that there was no evidence for this. | Accepted | No log showed it running, and it needs Docker. It is now marked "not run". |
| 8 | Build output (`target/`), logs and `.DS_Store` were committed. AI proposed untracking them. | Accepted | Repo hygiene. The files stay on disk and are now ignored. |
