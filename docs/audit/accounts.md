# Account lifecycle and authentication evidence

## Scope and revisions

This slice checks the exported User profile requests and statically traces the frontend authentication lifecycle. It does not execute Firebase, launch the app, use a backend, or verify the identity provider or server's authorization behavior.

- Frontend source reviewed: `58e1ec0de67030be7924587c4e76c016fc17519c` (ticket-10 after merging `integration/frontend-baseline-8`; source files in this slice are unchanged from the approved application baseline).
- Backend contract snapshot: `db7fef7cc0e8691c83fc49623212ef35093c11d7`, as recorded by `docs/testing/frontend-baseline.md`. The backend checkout was not available in this worktree, so no new backend source inspection is claimed here.
- Test environment: Node `v24.14.0`, npm `11.9.0`, Vitest `3.2.4`, Windows. Automated evidence is from the test-only wrapper seam; the test Firebase module and fetch are synthetic.
- Evidence links: [account wrapper tests](../../tests/api/accounts.test.js), [directory/shared-helper tests](../../tests/api/centres.test.js), [shared API wrapper](../../src/api.js), [auth lifecycle](../../src/main.jsx), [Firebase initializer](../../src/firebase.js), [administrator request helper](../../src/admin/adminApi.js).

All account names, IDs, tokens and error bodies in tests are invented fixtures. API hosts use the non-routable `.invalid` domain. No credentials, personal data, or live network calls are used.

## Named scenario register

| Scenario | Priority | Fixture/setup and acceptance assessment | Layer and source/revision | Environment and evidence | Outcome |
|---|---|---|---|---|---|
| Read current User profile | P1 | Synthetic profile; exported operation requests `/api/v1/users/me` and returns the response unchanged | Wrapper test; `src/api.js` at frontend revision above | Node 24.14.0 / npm 11.9.0 / Vitest 3.2.4; `tests/api/accounts.test.js` | Pass (wrapper only) |
| Create User profile | P1 | Synthetic name and response; exported operation sends JSON with POST to `/api/v1/users/signup` | Wrapper test; same source/revision | Same test environment; `tests/api/accounts.test.js` | Pass (wrapper only) |
| Update User profile | P1 | Partial synthetic name; exported operation sends JSON with PATCH to `/api/v1/users/me` | Wrapper test; same source/revision | Same test environment; `tests/api/accounts.test.js` | Pass (wrapper only) |
| Shared helper configuration and anonymous request | P1 | API base omitted in one case and no current Firebase User in the success case; assess local configuration error and absence of an Authorization header | Wrapper tests; `apiRequest` in `src/api.js` | Same test environment; account tests and shared helper tests | Pass (wrapper behavior) |
| Shared helper token acquisition | P1 | Rejected synthetic `getIdToken`; assess propagation and that no request is sent. Successful token/header behavior is covered by the shared-helper test | Wrapper tests; same source/revision | Same test environment; `tests/api/accounts.test.js`, `tests/api/centres.test.js` | Pass (wrapper behavior) |
| Shared helper responses and failures | P1 | Synthetic JSON, JSON `null`, text, 204, malformed JSON, rejected fetch, and HTTP 401/403/404/422/503 | Wrapper tests; same source/revision | Same test environment; account and shared-helper tests | Pass (wrapper behavior), with edge case F-AUTH-03; this does not assess UI recovery |
| Administrator helper configuration and identity prerequisites | P1 | Missing `VITE_API_BASE_URL`, no current User, and rejected synthetic token; assess that requests are stopped before fetch | Wrapper tests; `adminApi` in `src/admin/adminApi.js` | Same test environment; `tests/api/accounts.test.js` | Pass (helper behavior only) |
| Administrator helper token, headers, and success responses | P1 | Synthetic token/body/header; JSON success, non-JSON success, and 204 response | Wrapper tests; same source/revision | Same test environment; `tests/api/accounts.test.js` | Pass (helper behavior only) |
| Administrator helper denials and failures | P1 | Controlled 401/403, 404/422/503 JSON errors, unparsable error JSON and rejected fetch | Wrapper tests; same source/revision | Same test environment; `tests/api/accounts.test.js` | Pass (helper behavior only); proves neither server authorization nor user-visible recovery |
| Email signup, verification, and partial signup | P1 | No Firebase account or backend writes used; inspect registration branch and profile wrapper calls | Static source review; `src/main.jsx` and `src/api.js` at frontend revision above | Source-only; relevant lines 946–960 and 155–168 | Finding F-AUTH-01; runtime unverified |
| Email sign-in and unverified email | P1 | No Firebase identity-provider session; inspect login branch and error mapping | Static source review; `src/main.jsx` at frontend revision above | Source-only; relevant lines 962–990 | Pass (static flow present); actual provider behavior and UI recovery unverified |
| Google sign-in | P1 | No OAuth provider, popup, or Firebase project configured for this audit | Static source review; `src/main.jsx` at frontend revision above | Source-only; relevant lines 995–1000 | Unverified: isolated non-production Firebase/OAuth configuration and browser session unavailable |
| Sign-out, initialization, and reload | P1 | No Firebase listener or persistent auth session run; inspect auth-state callback, sign-out handlers, and state resets | Static source review; `src/main.jsx` at frontend revision above | Source-only; relevant lines 664–740 and 1005–1012 | Unverified: isolated Firebase project and named browsers unavailable |
| Account switch and data separation | P1 | No two synthetic Firebase accounts, backend, or browser storage session | Static source review only; `src/main.jsx` at frontend revision above | Source-only; listener at lines 664–740 | Unverified: isolated identity/API setup required to assess visible state and persistence across accounts |
| Expired/rejected token and suspended account | P1 | Wrapper-level rejected token and controlled 401/403 are tested; no real expiry, suspension, role or Firebase state | Wrapper tests plus static boundary review; `src/api.js`, `src/admin/adminApi.js`, `src/main.jsx` | Same test environment for wrapper cases; no backend/browser session | Finding F-AUTH-02 for recovery limits; server suspension enforcement unverified |
| Duplicate signup and partial account creation | P1 | No identity provider or write target; inspect signup error mapping and profile-creation catch | Static source review; `src/main.jsx` at frontend revision above | Source-only; relevant lines 946–960 | Finding F-AUTH-01; duplicate-address provider behavior unverified |
| Keyboard, visible focus, labels/errors, contrast, 200% zoom, screen-reader auth flow | P1 | No application runtime or browser/assistive technology | Manual accessibility check required by the approved matrix | Chrome/Firefox 1440×900, Safari 390×844 and AT versions unavailable in this run | Unverified: named isolated browser and assistive-technology sessions required |

Automated wrapper run after merging integration tip `288ca69` (family-profile slice): `npm run test:unit` and `npm run test:coverage` — **50 tests passed in 3 files**, no retries. The account/helper file has 29 cases, the directory/shared-helper file has 9, and the Family Preference Profile file has 12. Coverage is **87.45% statements, 97.43% branches, 51.85% functions, and 87.45% lines** across both wrapper modules; `src/api.js` is 84.86/97.95/50/84.86 and `src/admin/adminApi.js` is 100/96.55/100/100. The configuration limits test discovery to `tests/**/*.test.js`, so nested worktrees are not rediscovered. These figures assess wrappers only; they do not measure UI orchestration or authentication-provider behavior.

## Findings

### F-AUTH-01 — Signup can report success after backend profile creation fails

- Category: account lifecycle / API compatibility.
- Journey: email signup and duplicate/partial signup.
- Classification: observed behavior; product intent is unresolved.
- Evidence: frontend revision `58e1ec0de67030be7924587c4e76c016fc17519c`, `src/main.jsx` lines 946–960. The flow creates the Firebase account, optionally updates its display name, sends verification email, attempts `createMyProfile`, logs and swallows an API error, signs out, then displays “Account created. Please verify your email.”
- Reproduction: source trace only; no identity provider or write was run.
- Impact: Firebase identity and server User profile may be out of sync until a later authentication-state callback successfully creates a profile. The UI message does not report that the backend request failed.
- Severity: **Moderate** — partial registration can affect subsequent authenticated profile behavior, but no data-loss or privilege impact was demonstrated.
- Confidence: **High** that the control flow swallows this error; **Low** that this is a defect because intended recovery behavior is not established.
- Status: unresolved; no product change made.

### F-AUTH-02 — Authentication denials have wrapper evidence but no user recovery evidence

- Category: authentication / error recovery.
- Journey: rejected/expired token, suspended account, administrator access.
- Classification: evidence gap, not a confirmed defect.
- Evidence: frontend revision above, `src/api.js` lines 9–49 and `src/admin/adminApi.js` lines 4–62. The shared wrapper propagates token acquisition/fetch failures and formats HTTP failures; the administrator wrapper maps fetch failure and 401/403 to errors. Tests exercise those controlled branches, but no UI run establishes what a user sees or whether retry/sign-in recovery works.
- Reproduction: controlled wrapper outcomes in `tests/api/accounts.test.js`; no real expired token, suspended account, Firebase session, or backend authorization check.
- Impact: whether users can recover from expiry, suspension, or access denial is unknown. A client-side denial is not proof of server-side role enforcement.
- Severity: **Moderate** — account access and recovery are core flows, while server authorization risk is not inferred from these tests.
- Confidence: **High** that the named wrapper branches are exercised; **Low** about rendered behavior because no runtime evidence exists.
- Status: unresolved gap; isolated non-production identity/API configuration is required.

### F-AUTH-03 — A JSON `null` error body throws while formatting the shared API error

- Category: API error handling.
- Journey: shared account/profile requests and shared failures.
- Classification: observed behavior; intended fallback is not specified.
- Evidence: frontend revision `58e1ec0de67030be7924587c4e76c016fc17519c`, `src/api.js` lines 31–44. For a non-OK JSON response whose parsed body is `null`, the error formatter reads `body.detail` and throws a `TypeError` before creating its status-prefixed API error.
- Reproduction: `tests/api/accounts.test.js`, “exposes the current null-body HTTP error edge case”; synthetic 500 response with JSON `null` body.
- Impact: callers receive an unformatted runtime error instead of a useful API failure message for this malformed/empty error payload.
- Severity: **Low** — limited to malformed error responses and does not change successful requests.
- Confidence: **High** — deterministic at the existing exported wrapper boundary.
- Status: unresolved; no product change made.

## Manual gaps and limits

- Email signup/signin, Google popup, verification, password reset, sign-out, reload restoration, async initialization, and account switching were not run. Required setup is an isolated non-production Firebase project and synthetic accounts, then the approved Chrome/Firefox desktop and Safari mobile environments with exact browser/OS versions.
- Duplicate email, provider outage, suspended account, token expiry, and partial signup recovery were not exercised against an identity provider or backend. No production credentials or writes were used.
- Frontend administrator denial tests do not prove backend authorization. The backend revision is recorded from the existing baseline documentation, but this worktree had no sibling backend checkout for fresh route/schema/ADR inspection.
- No accessibility conformance claim is made. Keyboard, focus, labels/errors, contrast, 200% zoom, and screen-reader authentication smoke checks remain unavailable.
- The suite excludes React orchestration, Firebase initialization, browser storage, provider behavior, real service contracts, UI rendering, and server authorization. Fixture shapes are synthetic frontend test inputs, not proof of backend schema.
