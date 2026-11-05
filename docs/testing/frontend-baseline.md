# Frontend baseline: directory and Preschool Centre detail

## Revisions and tools

- Frontend checkout: `64437a2afaecdec13f580b166348a53745eba132` (initial test baseline); tests run on the ticket branch after test-only changes.
- Backend contract snapshot (read-only): `db7fef7cc0e8691c83fc49623212ef35093c11d7`.
- Working tree at implementation start: clean.
- Local environment: Node `v24.14.0`, npm `11.9.0`, Vitest `3.2.4`, `@vitest/coverage-v8` `3.2.4`; Vitest ran in Node on Windows.
- Compatibility evidence: the committed run used these exact versions successfully. No claim is made about other Node/npm combinations.

## Local procedure and isolation

From a clean checkout, run `npm ci`, `npm run test:unit`, and `npm run test:coverage`. The latter writes text, JSON summary and HTML coverage reports under `coverage/`; both commands emit JUnit totals at `test-results/junit.xml`. Vitest runs serially with one worker and has no retry configuration. CI uses the same Node/npm versions and commands, then retains the JUnit and coverage outputs as an artifact.

The wrapper tests mock `src/firebase.js` before importing `src/api.js`, set both API base variables to `.invalid` hosts, and replace `fetch` with a fail-closed mock. Each request used in a test has a specific mock response; an unconfigured request is recorded and rejected, then asserted absent after the test even if the code under test catches the rejection. No Firebase initializer, credentials, backend process, storage, clock or real network is used.

Centre fixtures are synthetic frontend test data. The “Synthetic Centre”, IDs, code, district names and response fragments are invented values; they are not copied from real people or centres and do not establish a backend contract.

## Test outcomes

The first slice covers the shared request configuration and all directory/detail wrapper exports: `getCentres`, `getDistricts`, `getCentreSummary`, `getCentreById` and `getCentreByCode`. Tests check repeated/omitted query values, filter pagination, identifier encoding, token/header/body behavior, JSON/text/204 responses, partial response preservation and HTTP error propagation. The local run passed 9 tests in 1 file (no retries). Current shared wrapper coverage is 77.29% statements, 81.25% branches, 26.92% functions and 77.29% lines; the collected administrator wrapper is 0% in all four measures because this slice does not import it. The committed JUnit and coverage commands retain machine-readable totals; CI run evidence remains unavailable until a hosted workflow executes.

Evidence layers and current outcomes:

| Scenario | Priority | Fixture/setup and provenance | Expected assessment | Layer and source/revision | Environment and evidence | Outcome |
|---|---|---|---|---|---|---|
| Directory populated response and filters | P1 | Synthetic list; arbitrary `district`, `page`, `limit` values | Request encodes filters and caller receives response | Wrapper test; `src/api.js` and `tests/api/centres.test.js` at this branch | Node 24.14.0, npm 11.9.0, Vitest 3.2.4; local JUnit/coverage run artifacts | Pass (test evidence) |
| Directory empty response and omitted filters | P1 | Empty synthetic result and blank/null query values | Empty result remains empty; empty values do not become query parameters | Wrapper test; same revision | Same test environment | Pass (test evidence) |
| District list and summary | P1 | Synthetic district strings and count object; invented shapes | Each exported wrapper requests its documented route and returns the response | Wrapper test; `src/api.js`; backend routes in `src/kidcarematch_backend/api/v1/centres.py` at backend revision above | Same test environment; `docs/testing/frontend-baseline.md` | Pass (wrapper); manual UI presentation unverified |
| Centre detail by ID and natural code | P1 | Synthetic path values including `/` and space; partial object | Identifiers remain one encoded path component; response is not reshaped by wrapper | Wrapper test; `src/api.js`; backend `get_centre_by_id` and `get_centre_by_code` routes at pinned backend revision | Same test environment | Pass (wrapper); manual display unverified |
| Centre contract shape | P1 | Backend route/schema source review; no live data | Compare frontend accepted response forms with backend response models | Static review; frontend `src/main.jsx` and backend `api/v1/centres.py`, `schemas/centre.py` at cited revisions | Source only; evidence links are repository paths | Static comparison complete; deployed/runtime compatibility is Gap G-01 |
| Missing centre / API outage recovery | P1 | HTTP 404 / 503 mocked where applicable; no backend launched | Record wrapper error and surface recovery prerequisites | Wrapper HTTP error coverage is partial; app handling inspected statically | Runtime service behavior unavailable | Unverified for UI recovery: isolated non-production API and app runtime absent |
| Map/location rendering and external map requests | P1 | No map service or runtime fixture | Verify map behavior and external requests safely | Static source inventory only | No verified isolated maps configuration | Unverified: map service isolation/runtime evidence absent |
| Keyboard, focus, responsive layout and labels/errors | P1 | Desktop Chrome/Firefox 1440x900 and mobile Safari 390x844 prescribed | Assess directory/search/detail interactions at named viewports | Manual UI audit | No app launch authorized without verified isolation; exact browsers/OS not exercised | Unverified: isolated runtime plus named browser environments absent |
| Directory/search screen-reader smoke | P1 | Synthetic non-production directory; no personal data | Record assistive technology/version and accessible names/state | Manual screen-reader audit | No screen reader/runtime session available | Unverified: isolated runtime and assistive-technology version absent |
| CI evidence | P1 | Required workflow runs lockfile install, tests, coverage and artifact upload | Verify actual hosted run and retained artifacts | GitHub Actions workflow | Workflow added; no hosted run executed from this checkout | Unverified: remote CI run unavailable |

The empty directory case uses an empty array in the test suite; coverage does not stand in for manual loading/error states. Runtime/browser gaps are explicit and are not counted as passes.

## Static contract comparison

At frontend revision `64437a2afaecdec13f580b166348a53745eba132`, `src/api.js` builds the shared base from `VITE_API_URL`, joins routes under `/api/v1/centres`, repeats array query values, omits null/empty values, and percent-encodes centre ID/code path values. `src/main.jsx` accepts a directory array or `{ items }`, reads `total`, accepts district arrays or `{ items }`/`{ data }`, and maps detail responses. This flexibility is frontend behavior; the automated tests exercise wrappers, not React orchestration.

At backend revision `db7fef7cc0e8691c83fc49623212ef35093c11d7`, `main.py` mounts the centres router. `api/v1/centres.py` provides GET directory, `/districts`, `/summary`, `/code/{centre_code}`, and `/{centre_id}` routes. `schemas/centre.py` declares list responses as `{ items, total, limit, offset }`, districts as objects with `district`, `name`, and `postal_sectors`, and summary as named count fields. Backend query names include `query`, repeated `district`, `postal_prefix`, `spark_certified`, `gov_subsidy`, `level`, `limit`, and `offset`. Directory district values are integers constrained to 1–28. Backend code was inspected read-only; backend tests and services were not run.

### Gap G-01 — Directory wrapper evidence does not establish rendered or deployed compatibility

- Category: API compatibility; journey: directory/search and detail.
- Evidence: frontend `src/main.jsx` response handling and backend `api/v1/centres.py`/`schemas/centre.py`, revisions above.
- Reproduction/limitation: automated wrapper tests return synthetic shapes and do not exercise the UI mapping or a deployed API. The backend schema shape and frontend accepted forms can be compared statically, but no safe isolated runtime was supplied.
- Impact: field-level mapping, empty/loading/error recovery, map dependencies and rendered presentation remain unverified.
- Missing prerequisite: verified isolated non-production API/Firebase/maps configuration and the named browser environments.

No product defect is confirmed by this slice. The gap records missing runtime evidence, not an assertion that frontend and backend contracts disagree.

## Scope and limits

No application source, Firebase configuration, existing application dependency declaration, nested package, tracked build artifact or backend file was intentionally edited. Tests cover the wrappers only; UI orchestration, private helpers, browser behavior, service authorization, map service behavior and live API compatibility remain outside this result. Wrapper coverage is not whole-application confidence. No browser or assistive technology run, app launch, production probe, backend test, build or deployment was performed.
