# Centre Commute Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an inline OneMap commute comparison in centre details using the loaded family's home and optional workplace.

**Architecture:** Add a separate backend display contract that returns real geometry and explicit unavailable states, preserving the matching adapter's existing behaviour. Use React Leaflet in the current details modal and a small session controller for mode/sample consistency and stale-request cancellation. All paths prefixed `backend/` below are relative to sibling `../kidcarematch-backend`; frontend paths are relative to this repository.

**Tech Stack:** React, React Leaflet/Leaflet (already installed), FastAPI, Pydantic, httpx, pytest, Vitest.

**Spec:** [Accepted design](../specs/2026-11-06-centre-commute-profile-design.md) and [ADR-0001](../../adr/0001-separate-commute-display-from-matching.md).

## Global Constraints

- Modes: `drive`, `pt`, `walk`, `cycle`; initially driving; one selected mode for both journey legs.
- Samples: 08:00 Asia/Singapore on the next upcoming Wednesday and Saturday; same conditions across the comparison session.
- Label representative sample assumptions; use one estimate where day-dependent variation cannot be verified.
- No departure-time/drop-off controls, navigation, ranking changes, or shared-matching fallback changes.
- Workplace adds an onward leg whenever present in the loaded profile. Guests see only centre location and a sign-in prompt.
- Display successful legs on partial failure, omit incomplete totals, and never substitute straight-line estimates for routed geometry.
- Keep OneMap credentials server-side and validate profile ownership. No deployment or credential provisioning is included.
- Backend writes require access to the sibling repository under the execution environment's permissions; do not bypass those boundaries.

## Review Focus

- Public-transport responses may use per-leg encoded geometry and timestamp conventions; Tasks 1–2 establish fixtures and normalisation.
- Previously cached postcode matches may have been relevance matches; Task 2 verifies exact returned postal codes before map use.
- A centre/mode/account change during an inflight request must not show a stale home route; Task 4 tests cancellation and session invalidation.
- Sessions spanning sample expiry must refresh all comparisons consistently; Tasks 3–4 exercise rejected/expired sample pairs.
- An itinerary can contain time but lack usable geometry; Task 2 treats it as unavailable rather than a successful map route.

---

### Task 1: Establish the actual OneMap contract

**Files:** Create `backend/docs/research/onemap-commute-contract.md`, synthetic provider fixtures under `backend/tests/fixtures/onemap/`.

**Interfaces:** The evidence document fixes request authentication, PT date/time semantics, duration/distance units, per-leg geometry and timestamps, and verified day-dependence before Task 2 depends on them.

- [ ] Inspect current official REST documentation and the existing backend adapter. Record the exact request/response contract for all four modes, including a two-leg PT journey. Distinguish MCP documentation from REST evidence.
- [ ] Where available, use authorised nonpersonal test coordinates and configured server credentials to verify the contract without printing tokens or storing real home/workplace data. Otherwise use authoritative provider examples. Record the evidence source and any limitation; do not fabricate successful responses.
- [ ] Produce sanitised/synthetic fixtures matching the verified formats and units. Confirm onward PT departure can use first-leg arrival with zero added stop time.
- [ ] If essential PT semantics/geometry cannot be verified or supported, stop dependent integration and report that concrete limitation for a product decision. Profile onboarding and basic centre-location work can continue. Mark this task complete only when the evidence supports Task 2.
- [ ] Commit only safe evidence/fixtures with `docs: establish OneMap commute display contract`.

### Task 2: Add a strict commute adapter without changing matching

**Files:** Create `backend/src/kidcarematch_backend/core/commute.py`, `backend/src/kidcarematch_backend/schemas/commute.py`, `backend/tests/test_core_commute.py`; modify `backend/src/kidcarematch_backend/core/config.py` only if required.

**Interfaces:** Define `Coordinate(lat: float, lng: float)`, `RouteTotals(duration_seconds: float, distance_meters: float)`, `RouteLeg(from_anchor, to_anchor, status, source, duration_seconds, distance_meters, geometry, message)` and `CommuteSample(kind, sampled_at, legs, totals)`. Geometry is a list of coordinates; unavailable metrics/geometry and incomplete totals are null. Source is `onemap` for genuine provider results, otherwise null. Status is `available` or `unavailable`; anchors are `home`, `centre`, `workplace`; sample kinds are `weekday`, `weekend`, `single`. Export `resolve_commute_postal(postal: str, client: httpx.Client) -> Coordinate | None` and `get_commute_leg(from_anchor, to_anchor, start: Coordinate, end: Coordinate, mode, departure: datetime | None, client: httpx.Client) -> RouteLeg`; use the stated literal enums for mode and anchors.

- [ ] Write failing fixture-driven tests for all modes' actual geometry, seconds/metres, PT walking/transfers, exact-postcode selection when the first search result differs, missing geometry, malformed responses, timeout and invalid/expired authentication. Verify no failure returns synthetic straight-line travel as available.
- [ ] Run `uv run pytest tests/test_core_commute.py` in the backend; expect FAIL before implementation. Follow backend execution-permission instructions.
- [ ] Implement strict normalisation using Task 1 evidence. Keep `core/onemap.py:get_route_duration_and_distance` and its matching callers unchanged. Reuse verified cache entries only; unverified legacy cache entries must not bypass exact-postcode validation. A separate bounded commute cache is acceptable without a database migration.
- [ ] Rerun targeted tests and existing matching fallback tests; expect PASS. Commit with `feat: add explicit OneMap commute route results`.

### Task 3: Expose centre location and owned-profile commute results

**Files:** Modify `backend/src/kidcarematch_backend/api/v1/centres.py`; extend `backend/src/kidcarematch_backend/schemas/commute.py`; create `backend/tests/test_api_commute.py` and `backend/src/kidcarematch_backend/core/commute_samples.py`.

**Interfaces:** Public `GET /api/v1/centres/{centre_id}/location` returns `{centre_id, coordinate, status}`. Parent-only `POST /api/v1/centres/{centre_id}/commute` accepts `{profile_id, mode, sample_pair?}`. `sample_pair` contains weekday/weekend ISO timestamps previously returned by the server. Response returns `{centre_id, profile_id, mode, sample_pair, anchors, samples}` using Task 2 types. The server selects initial Wednesday/Saturday 08:00 samples and validates reused samples; expired samples return 409 with code `sample_expired`.

- [ ] Write failing API tests for public location without personal fields; 401 unauthenticated commute; 403 admin/suspended users; 404 other-owner profiles/unknown centres; invalid mode/profile data; Singapore timezone/date boundaries; complete/no-workplace/partial/unresolvable routes; null incomplete totals; expired samples.
- [ ] Run `uv run pytest tests/test_api_commute.py`; expect FAIL before implementation.
- [ ] Add owned-profile lookup using existing parent dependencies. Derive home/workplace server-side and ignore matching location preference for workplace inclusion. Validate complete persisted profile inputs without changing existing profile CRUD. Build initial/reused samples server-side with fixed local 08:00, validate within the next upcoming occurrence window, and route PT onward at first-leg arrival. Omit the onward PT estimate when arrival cannot be established.
- [ ] Keep sample and leg failures explicit in the response; distinguish global request/ownership errors from upstream leg unavailability. Cache only by relevant verified anchors, mode and dates/times. Supply `single` for modes lacking verified day-dependence. Do not modify anonymous matching contracts or its fallback.
- [ ] Run `uv run ruff check .`, `uv run mypy src tests`, `uv run pytest` under backend instructions; expect all exit 0. Commit with `feat: expose centre commute comparison endpoints`.

### Task 4: Add frontend API and comparison-session state

**Files:** Modify `src/api.js`; create `src/commute/commuteSession.js`, `tests/api/commute.test.js`, `tests/commute/commute-session.test.js`.

**Interfaces:** Export `getCentreLocation(centreId, options = {})` and `getCentreCommute(centreId, {profileId, mode, samplePair}, options = {})` using Task 3 endpoints. Export `createCommuteSession({loadCommute, onState})` returning `{open({centreId, profileId}), setMode(mode), selectSample(kind), retry(), reset()}`. It stores the selected mode (initial `drive`), server-issued sample pair and selected sample (initial weekday), and ignores stale requests. `reset()` clears user-specific state.

- [ ] Write failing tests for encoded centre IDs, request body and bearer-token forwarding, AbortSignal propagation, mode retention across centres, selected sample switching, stale centre/mode responses, reset on account/profile change, and 409 invalidation of the entire old sample pair.
- [ ] Run `npm run test:unit -- tests/api/commute.test.js tests/commute/commute-session.test.js`; expect FAIL before implementation.
- [ ] Add wrappers and the session controller. Use returned metadata and provider statuses; do not calculate unsupported differences client-side. On sample expiry clear cached comparisons, obtain a fresh pair and restart the active request once; do not mix old/new sample summaries.
- [ ] Rerun targeted tests; expect PASS. Commit with `feat: manage centre commute comparisons`.

### Task 5: Render the inline commute section

**Files:** Create `src/commute/CentreCommute.jsx`; modify `src/main.jsx` and `src/styles.css`.

**Interfaces:** `CentreCommute({centreId, userId, profileId, profileRevision, onSignIn, onEditProfile})` owns a Task 4 session instance. Guests load only centre location; eligible parents load commute data. `profileRevision` changes when locations change, forcing old geometry/request invalidation.

- [ ] Extend session tests for partial leg visibility, omitted totals, per-leg metrics, and a single estimate with no false weekday/weekend difference. Run them before changing UI; expect failures for any missing state behaviour.
- [ ] Render OneMap basemap, labelled anchors, distinguishable actual leg geometry, all four mode controls, sample-labelled summaries and per-leg/complete totals below the address. Add loading, unavailable, retry and edit-profile states. Keep text usable without map interaction and other details readable during requests.
- [ ] Retain existing modal close/contact/review behaviour; give keyboard users labelled controls and avoid trapping page scroll in the map. Fit bounds after modal/map sizing and whenever visible geometry changes. Stack summaries on mobile. Never display another account's cached route.
- [ ] Run `npm run test:unit` and `npm run build`; expect exit 0. Verify desktop/mobile guest and parent views, home-only/two-leg routes, all modes, sample switching, failures, profile edits, rapid centre changes, signout and keyboard interaction. Record actual checks; do not claim live provider verification from mocked tests.
- [ ] Commit with `feat: show OneMap commute routes in centre details`.

## Handoff

Implementation has not started. Complete Task 1 before promising the timed PT integration. The [profile onboarding plan](2026-11-06-required-family-profile.md) is independently deliverable and should run first when implementing both features. Deployment and credential provisioning require their own authorised execution context.
