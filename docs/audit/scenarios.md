# Named scenario register

This is the expanded register required by the approved matrix; each line is an individual check. The register preserves the distinction between outcome and interpretation: **pass** means only that the named test or static comparison was completed; **finding** links an unresolved record; **unverified** names the missing prerequisite. Static source observations do not declare product behavior correct.

## Shared provenance and environment

- Frontend source baseline: `64437a2afaecdec13f580b166348a53745eba132`; integration/test baseline: `64ffbcb5d6724feb0fbf67d08c4ea59be30740b8`. Slice-specific source revisions are recorded in each linked report. Source files are unchanged.
- Backend: read-only sibling checkout `db7fef7cc0e8691c83fc49623212ef35093c11d7`, verified at HEAD during final reconciliation. Route/schema/ADR comparisons cite this exact revision; no service or tests ran.
- Wrapper tests: Windows Node `v24.14.0`, npm `11.9.0`, Vitest / `@vitest/coverage-v8` `3.2.4`; Firebase mock, synthetic `.invalid` API hosts, fail-closed fetch, synthetic records only. Both `VITE_API_URL` and `VITE_API_BASE_URL` are set before wrapper module evaluation. Relevant automated evidence links to the named test file and successful 84/84 run in [the index](README.md#test-totals-and-coverage).
- Manual browser targets required by the approved matrix: Chrome desktop 1440×900; Firefox desktop 1440×900; Safari mobile 390×844. Browser, OS, iOS and assistive-technology versions were not supplied or run. All named browser and AT checks below are unverified pending isolated runtime and exact version capture.
- Test fixture provenance: all IDs, centre fields, account names, tokens, dates, rules, Reviews and responses are invented. Some fixtures mimic frontend request shapes and are cross-checked statically against the pinned backend; that does not make a fixture live-contract evidence. No personal data or real bearer token is present.

## Account lifecycle, API helpers, and shared failures — P1

Source/evidence: [accounts.md](accounts.md), `src/main.jsx`, `src/api.js`, `src/admin/adminApi.js`; wrapper cases in [accounts.test.js](../../tests/api/accounts.test.js) and [centres.test.js](../../tests/api/centres.test.js). Synthetic fixtures and exact wrapper environment as above.

| ID / scenario | Setup and expected assessment | Layer / pinned source | Evidence and outcome |
|---|---|---|---|
| AC-01 Read current User profile | Synthetic User response; verify GET route and response pass-through. | Wrapper; shared `getMyProfile`; frontend baseline. Backend user route/schema static comparison. | `accounts.test.js`; **pass**, wrapper only. |
| AC-02 Create User profile | Synthetic name; verify POST JSON payload/content type and success pass-through. | Wrapper; `createMyProfile`; backend signup route/schema. | `accounts.test.js`; **pass**, wrapper only. Signup lifecycle/UI is AC-10/11. |
| AC-03 Update User profile | Partial synthetic payload; verify PATCH body and current-user route. | Wrapper; `updateMyProfile`; backend User schema. | `accounts.test.js`; **pass**, wrapper only. |
| AC-04 Missing shared API base | Clear `VITE_API_URL`; verify local configuration error and no fetch. | Wrapper; `apiRequest` in `src/api.js`. | `accounts.test.js`; **pass**. Both env vars reset between cases. |
| AC-05 Anonymous shared request | No current Firebase User; verify request proceeds without Authorization. | Wrapper; `apiRequest`. | `centres.test.js`; **pass**. Does not establish server access policy. |
| AC-06 Successful token acquisition and header merge | Synthetic User/token and JSON request; verify bearer/content/Accept and caller headers. | Wrapper; `apiRequest`. | `centres.test.js`; **pass**. |
| AC-07 Rejected token acquisition | Synthetic rejected token promise; verify rejection and no request. | Wrapper; shared helper. | `accounts.test.js`; **pass**. |
| AC-08 Shared success response forms | Synthetic JSON, `null`, text, and 204 responses; assess returned body/null. | Wrapper; shared helper. | `accounts.test.js`, `centres.test.js`; **pass** for specified cases. |
| AC-09 Shared malformed/error/network cases | Malformed JSON, rejected fetch, text error, HTTP 401/403/404/422/503, JSON null error body. | Wrapper; shared helper. | `accounts.test.js`; **pass** for transport branch; JSON-null formatter behavior is **finding F-AUTH-03**. No rendered recovery evidence. |
| AC-10 Email signup, verification, partial profile failure | Static trace with no identity account/write; assess Firebase account, verification and profile creation order plus failure message. | Static; `src/main.jsx` / `src/api.js`; backend auth/User source and ADR 0003 at pinned revision. | [accounts.md](accounts.md#f-auth-01--signup-can-report-success-after-backend-profile-creation-fails); **finding F-AUTH-01**. Provider behavior and UI recovery unverified. |
| AC-11 Email sign-in and unverified email | Static login and error mapping; assess sign-in and verification gate. | Static; `src/main.jsx`; ADR 0003. | `accounts.md`; static path **pass**; actual provider and recovery **unverified** (isolated Firebase account). |
| AC-12 Google sign-in | Synthetic OAuth account required; assess popup success/cancel/provider error. | Manual; `src/main.jsx`. | **Unverified**: isolated non-production Firebase/OAuth project, account, named browsers/OS unavailable. |
| AC-13 Sign-out | Assess Firebase sign-out, visible transition and error recovery. | Static/manual; `src/main.jsx`; ADR 0003. | Static handler inspected; runtime **unverified** (isolated identity session/browser missing). |
| AC-14 Auth initialization and reload restoration | Delayed auth listener and fresh reload; assess loading/signed-out/signed-in transitions. | Static/manual; `src/main.jsx`; ADR 0003. | **Unverified**: isolated Firebase session and named browser versions missing. |
| AC-15 Account switch/data separation | Two invented Users in one browser; assess cleanup and per-account state. | Static/manual; `src/main.jsx`, local key paths. | **Unverified**: two isolated identities/API and storage/browser runtime missing; watchlist carryover also **finding W-01**. |
| AC-16 Expired/rejected token | Controlled token rejection and HTTP denials; assess wrapper behavior separately from UI recovery. | Wrapper + static; shared/admin wrappers, ADR 0003. | Wrapper paths **pass**; user recovery **finding F-AUTH-02**; real token expiry unverified. |
| AC-17 Suspended User | Synthetic suspended account; assess server API denial and frontend recovery. | Static/manual; backend auth/user/role routes and ADR 0005. | Wrapper denial behavior **pass** only; suspension enforcement **unverified** without isolated service; see F-AUTH-02. |
| AC-18 Duplicate signup | Duplicate synthetic address at identity provider; assess message and no misleading partial state. | Static/manual; `src/main.jsx`. | Signup error mapping inspected; actual duplicate/provider behavior **unverified**. Partial failure linked F-AUTH-01. |
| AC-19 Admin helper missing base | Clear `VITE_API_BASE_URL`; verify configuration failure/no fetch. | Wrapper; `adminApi`. | `accounts.test.js`; **pass**. |
| AC-20 Admin helper signed-out user | No current User; verify rejection before fetch. | Wrapper; `adminApi`. | `accounts.test.js`; **pass**. Server security remains unverified. |
| AC-21 Admin helper token/header/success | Synthetic admin token and mixed headers; JSON, text, 204 forms. | Wrapper; `adminApi`. | `accounts.test.js`; **pass**. |
| AC-22 Admin helper 401/403/404/422/503 and malformed errors | Controlled response and rejected token; verify each supported error mapping and no unexpected fetch. | Wrapper; `adminApi`. | `accounts.test.js`; **pass**, client behavior only; server authorization/UI recovery **unverified** (F-AUTH-02). |
| AC-23 Admin rejected fetch and parse failure | Rejected fetch and malformed success/error JSON; assess connectivity/error propagation. | Wrapper; `adminApi`. | `accounts.test.js`; **pass**. |

## Directory, pagination, loading, detail, and map — P1

Source/evidence: [frontend-baseline.md](../testing/frontend-baseline.md), `src/main.jsx`, `src/api.js`; tests in [centres.test.js](../../tests/api/centres.test.js). Fixture shapes are invented; backend route/schema sources `api/v1/centres.py`, `schemas/centre.py` are pinned to backend hash above. See gap G-01 in the slice report.

| ID / scenario | Setup and expected assessment | Layer / source | Evidence and outcome |
|---|---|---|---|
| DIR-01 Populated directory | Synthetic centre list; verify GET and filter query serialization/response pass-through. | Wrapper; `getCentres`. | `centres.test.js`; **pass**, wrapper only. |
| DIR-02 Empty directory | Empty synthetic list; verify empty result remains empty. | Wrapper; `getCentres`. | `centres.test.js`; **pass** for wrapper response; rendered empty state **unverified**. |
| DIR-03 Query/filter encoding | Repeated districts, omitted null/blank values, arbitrary page/limit/filter values; assess URL encoding. | Wrapper; shared query builder; backend query names statically compared. | `centres.test.js`; **pass** wrapper; no live query. |
| DIR-04 Search text and filter application | Synthetic terms/district/centre fields; assess form state, clear/reset, applied query and result consistency. | Static/manual; `src/main.jsx`, backend centre route. | Source reviewed; interaction **unverified**: isolated API/runtime and named browser missing. |
| DIR-05 Pagination first/next/previous/end | Synthetic multi-page dataset, empty last page, repeated query values; assess offset/limit transitions and displayed count. | Wrapper + static/manual; `src/api.js`, `src/main.jsx`, backend pagination schema. | Wrapper serialization **pass**; UI pagination/loading transitions **unverified** (no isolated runtime). |
| DIR-06 District options | Synthetic district strings/object shapes; verify district endpoint wrapper and compare schema. | Wrapper/static; `getDistricts`, backend centre schema. | `centres.test.js`; wrapper **pass**; UI option rendering **unverified**. |
| DIR-07 Summary counts | Synthetic summary object; verify route/response and UI labels. | Wrapper/static; `getCentreSummary`, backend route/schema. | `centres.test.js`; wrapper **pass**; rendered summary **unverified**. |
| DIR-08 Initial loading state | No response / delayed request; assess initial loading indication, duplicate requests and transition to result. | Static/manual; `src/main.jsx`. | **Unverified**: app runtime, isolated API, exact browser/OS unavailable. |
| DIR-09 Directory API outage and retry/recovery | Controlled 401/403/404/422/5xx and rejected fetch; assess error copy, retry and retained filters. | Wrapper + static/manual; shared helper and directory caller. | Wrapper HTTP error covered (centres/accounts tests); UI recovery **unverified**: no app/API runtime. |
| DIR-10 Centre detail by ID | Synthetic reserved path chars and partial centre; assess encoded path and unchanged response. | Wrapper; `getCentreById`; backend route/schema. | `centres.test.js`; **pass** wrapper. |
| DIR-11 Centre detail by code | Synthetic natural code including `/`/space; assess encoded single path segment and response. | Wrapper; `getCentreByCode`; backend route/schema. | `centres.test.js`; **pass** wrapper. |
| DIR-12 Detail display and list/detail merge | Full plus missing optional fields; compare displayed defaults, selected item and detail merge. | Static/manual; `src/main.jsx`; backend `schemas/centre.py`. | Static comparison; rendered contract **unverified**; gap G-01. |
| DIR-13 Missing centre / 404 | Synthetic missing identifier and controlled 404; assess not-found state and navigation recovery. | Wrapper + manual; detail caller. | Wrapper error mechanism **pass**; rendered state **unverified** (isolated service/browser absent). |
| DIR-14 Detail load and partial/failure isolation | Slow response, partial payload, 404/503 for one item; assess loading and whether other details remain usable. | Static/manual; detail loading code; see CMP-04. | Branches inspected; runtime **unverified**; CMP-04. |
| DIR-15 Map and location rendering | Synthetic centre location; trace map tile/geocode/network destinations and rendered map state. | Static/manual; map-related frontend dependencies and config. | **Unverified**: map/external requests cannot be verified isolated; no app launch or map target. |
| DIR-16 Map unavailable / denied / malformed location | Map provider outage, denied geolocation, missing coordinates; assess fallback and no blocking of directory. | Static/manual. | **Unverified**: controlled map/provider/browser runtime unavailable. |
| DIR-17 Manual keyboard/focus/labels/errors/contrast/zoom | Search, filters, pagination, directory and detail controls; criterion-level matrix AX-01 onward below. | Manual; `src/main.jsx`, relevant CSS. | **Unverified**: isolated runtime and exact Chrome/Firefox/Safari OS versions absent. |
| DIR-18 Directory screen-reader smoke | Search/filter/list/detail and loading/error states with named AT/browser. | Manual; source controls and status announcements. | **Unverified**: AT/browser/OS version and isolated runtime absent. |

## Family Preference Profile, conversion, ranking, and explanation — P1

Source/evidence: [family-profiles.md](family-profiles.md), backend `api/v1/profile.py`, `schemas/profile.py`, `core/matching.py`, ADR 0006 and 0007 at pinned backend revision. API fixtures are invented. Wrapper test: [family-profiles.test.js](../../tests/api/family-profiles.test.js). Static findings FFP-01/02 remain unresolved.

| ID / scenario | Setup and expected assessment | Layer / source | Evidence and outcome |
|---|---|---|---|
| FP-01 List saved profiles | Synthetic profile collection; verify GET, token and response preservation. | Wrapper; `getFamilyProfiles`. | `family-profiles.test.js`; **pass** wrapper only. |
| FP-02 Create profile | Synthetic profile payload; verify POST JSON/body/header. | Wrapper; `createFamilyProfile`. | Same; **pass** wrapper only. |
| FP-03 Update profile | Synthetic ID containing path-reserved characters and fields; verify PUT/body/encoding. | Wrapper; `updateFamilyProfile`. | Same; **pass** wrapper only. |
| FP-04 New/incomplete profile | Default/incomplete and complete synthetic preferences; assess validation, completeness and navigation gates. | Static/manual; `src/main.jsx:184-191,909-920,1333-1364`. | Static path inspected; rendered recovery **unverified** (isolated account/runtime unavailable). |
| FP-05 Save/edit/server-local disagreement/reload | Per-UID local key, server success/failure/empty response; assess write order and source precedence without deciding intended authority. | Static/manual; `src/main.jsx:189,589-607,1333-1364`; wrappers FP-01/02. | Source flow recorded; browser persistence **unverified**. FFP-01. |
| FP-06 Field conversion/schema | Compare frontend field names/defaults/omitted weights against profile API schema. | Static; `src/main.jsx:193-227`; backend schema+ADR 0006. | Static discrepancy **finding FFP-02**; runtime round-trip unverified. |
| FP-07 Enrollment month/timezone | Synthetic `YYYY-MM` near month boundary; assess validation and UTC normalization. | Static/manual; `src/main.jsx:179-183,197-227`; backend schema/ADR 0006. | Static comparison complete; browser timezone/service boundary **unverified**. |
| FP-08 Saved profile lifecycle/multiple profiles | Multiple synthetic server profiles and names; assess list selection, create/edit, uniqueness, and whether current UI can select each. | Static/manual; frontend load/save; backend profile route/ADR 0006. | **Finding FFP-01**; rendered collection behavior unverified. |
| FP-09 Missing server profile and account separation | Empty server list, local UID key, two synthetic Users; assess fallback, reload, signout/switch isolation. | Static/manual; `src/main.jsx:189,589-612,640-722`; ADR 0006. | Fallback inspected; account switch/reload **unverified**. FFP-01. |
| FP-10 Weights and conversion | Three-factor vacancy/cost/travel values; compare save/load conversion and missing vacancy weight. | Static; `src/main.jsx:193-227`; backend schema/ADR 0006. | **Finding FFP-02**; no persistence run. |
| FP-11 Local ranking and ordering | Fixed synthetic centre set; compare local fee/vacancy/travel scores, ordering and tie-breaks. | Static/manual; `src/main.jsx:1185-1232`; backend `core/matching.py:612-723`, ADR 0007. | Algorithms differ (**finding FFP-02**); displayed rank under runtime **unverified**. |
| FP-12 Match explanation | Fixed synthetic profile/centres; assess explanation text against score inputs and missing factors. | Static/manual; `src/main.jsx:2413-2432`; backend algorithm ADR 0007. | Source reviewed; rendered explanation **unverified**; no cross-engine equivalence claimed. |
| FP-13 Async auth and server failure | Delayed auth, rejected token/fetch, HTTP errors; assess wrapper propagation and visible recovery. | Wrapper/static; `src/main.jsx:589-612,640-722`; ADR 0003/0006. | Wrapper error branches **pass**; UI race/recovery **unverified**. |
| FP-14 Disabled/corrupt storage | Malformed profile JSON, throwing read/write; assess guarded fallback and retained in-memory state. | Static/manual; `src/main.jsx:589-592,1160-1168,1343-1346`. | Catch/fallback source inspected; rendered recovery **unverified** (storage/browser unavailable). |
| FP-15 Profile API auth/errors | No user, token, token failure, HTTP 401/403/404/422/5xx, malformed JSON. | Wrapper; profile operations/backend route/ADR 0006. | `family-profiles.test.js`; **pass** wrapper; server ownership/authorization **unverified**. |
| FP-16 Matching/detail performance | Fixed profile and centre dataset, cold/warm cache; capture result time, requests, main-thread. | Manual perf; `src/main.jsx:1185-1327`; backend ADR 0007. | **Unverified**; environment metadata gaps in performance section. |

## Watchlist Entries, local vacancy alerts, and notification wrappers — P1

Source/evidence: [watchlist.md](watchlist.md); backend `api/v1/watchlist.py`, `schemas/watchlist.py`, ADR 0005 at pinned hash. Wrapper test: [watchlist.test.js](../../tests/api/watchlist.test.js). Local alerts and server Notifications are separate concepts.

| ID / scenario | Setup and expected assessment | Layer / source | Evidence and outcome |
|---|---|---|---|
| W-S01 Add Watchlist Entry | Synthetic centre 37, level n1 and UTC month; verify authenticated POST/body/response. | Wrapper; `createWatchlist`; backend watchlist schema. | `watchlist.test.js`; **pass**, write not sent to service. |
| W-S02 Remove Watchlist Entry | Synthetic reserved-character ID; verify encoded DELETE and 204 => null. | Wrapper; `deleteWatchlist`. | Same; **pass**, UI rollback unverified. |
| W-S03 Duplicate Entry | Controlled 409; assess error propagation without defining duplicates as success. | Wrapper + static; backend duplicate rule. | **Pass** wrapper; UI refresh **unverified**. |
| W-S04 Legacy browser-only entry reconciliation | Global legacy IDs and current User's server list; assess migration/merge/account behavior. | Static/manual; `src/main.jsx:531-537,696-716,777-804`; backend per-user filtering. | **Finding W-01**; actual display/reconcile runtime unverified. |
| W-S05 Reload/account switch | Two synthetic Users, global legacy key versus per-user server entry. | Static/manual; auth/watchlist source; backend watchlist routes/ADR 0005. | **Finding W-01** plus **unverified** runtime (Firebase accounts/browser absent). |
| W-S06 Default pagination | No explicit params; verify client default limit 100 for watchlist and 20 for notifications. | Wrapper/static; `getMyWatchlist`, `getNotifications`; backend watchlist default 20. | `watchlist.test.js`; **pass** request construction; default discrepancy recorded in source comparison. |
| W-S07 Custom pagination/filter encoding | Synthetic repeated arrays, blanks, nulls, page values; assess URL serialization. | Wrapper; both list exports. | Same; **pass** wrapper. |
| W-S08 Watchlist read/list | Synthetic authenticated list and token; verify route/auth/response. | Wrapper; `getMyWatchlist`; backend route/schema. | Same; **pass** wrapper. |
| W-S09 Vacancy opens | Synthetic transition from no vacancy to open vacancy; assess local derived alert creation and refresh cadence. | Static/manual; `src/main.jsx:381-431,806-828`. | Derivation inspected; **unverified** runtime (isolated API/browser/clock). |
| W-S10 Vacancy closes | Synthetic open-to-closed status; assess local alert removal/retention semantics. | Static/manual; same source. | **Unverified**: no controlled service/browser/clock; no delivery claim. |
| W-S11 Vacancy reopens | Closed-to-open synthetic status; assess ID/history/unread behavior. | Static/manual; same source. | **Unverified**: no controlled service/browser/storage/clock. |
| W-S12 Read one alert/unread count | Synthetic notification list and reserved-char ID; verify GET and individual read POST; distinguish local `local:` read state. | Wrapper/static; notification exports, `src/main.jsx:1023-1036`. | Wrapper **pass**; UI transition **unverified**; backend route mismatch W-02. |
| W-S13 Mark all read | Synthetic read-all acknowledgement; verify POST and response; assess local/server persistence separately. | Wrapper/static; `src/main.jsx:1038-1045`. | Wrapper **pass**; server route mismatch **finding W-02**, UI unverified. |
| W-S14 Missing notification endpoint | Controlled 404 plus pinned backend route inventory; assess local watchlist-derived fallback separately. | Wrapper/static; `src/main.jsx:368-371,734-751`; backend route tree. | Error propagation **pass**; **finding W-02**; fallback statically observed, not run. |
| W-S15 Failed create | Controlled 401/403/409/422/5xx and rejected fetch/token; assess caller recovery/rollback. | Wrapper/static; `src/main.jsx:1088-1152`. | Wrapper **pass**; UI/persistence **unverified** (safe write service unavailable). |
| W-S16 Failed delete | Controlled 404/5xx/rejected fetch; assess optimistic state rollback and retry. | Wrapper/static; delete caller. | Wrapper **pass**; UI recovery **unverified**. |
| W-S17 Failed individual/read-all persistence | Controlled 503/500 and fetch failure; assess local state and retry. | Wrapper/static; notification callers. | Wrapper **pass**; UI read state **unverified**; W-02. |
| W-S18 Partial/malformed response and parse error | Partial list/notification shapes and invalid JSON; determine pass-through versus wrapper error. | Wrapper; shared helper. | `watchlist.test.js`; **pass** for pass-through/error propagation; UI malformed handling unverified. |
| W-S19 Signed-out and async auth | No User, delayed token, rejected token; assess no Authorization without User, token when available, no fetch on rejection. | Wrapper + static; auth listener. | Wrapper **pass**; UI auth race/signed-out display **unverified**. |
| W-S20 Disabled/corrupt storage | Throwing read/write and invalid JSON for `kidcare-watchlist` and UID alert store. | Static/manual; `src/main.jsx:372-378,531-537,1067-1075`. | Catch/fallback identified; **unverified** user-visible recovery. |
| W-S21 Date/timezone boundary | UTC enrollment month normalization and local alert dates around month boundary. | Static/manual; frontend date logic and backend `schemas/watchlist.py`. | **Unverified**: no controlled clock/timezone/browser. |
| W-S22 Watchlist keyboard/focus/labels/error/dialog | Test notification dialog and Watchlist controls against AX criteria below. | Manual; `src/main.jsx:440-500,1518-1530,1788-1794`. | **Unverified**: safe runtime, exact browsers/OS and AT absent. |
| W-S23 Watchlist responsive layout | Populated/empty/error states at all three approved browser/viewport pairs. | Manual; `src/main.jsx:1987-2068`, styles. | **Unverified**: no named browser/OS/runtime. |

## Comparison — P2

Source/evidence: [comparison-performance.md](comparison-performance.md), `src/main.jsx`, `src/styles.css`; synthetic saved centre records only. `CMP-F-01` remains unresolved.

| ID / scenario | Setup and expected assessment | Layer / source | Evidence and outcome |
|---|---|---|---|
| CMP-01 Select, unselect, clear, remove card | Three synthetic centres; distinguish comparison removal from Watchlist removal. | Static/manual; comparison controls. | Controls inspected; interaction **unverified** (isolated runtime/browser missing). |
| CMP-02 Multiple centres and three-centre cap | Four synthetic IDs 900001–900004; assess order/count and fourth-selection feedback. | Static/manual; comparison state/limit. | Three-item cap seen in source; fourth feedback/layout **unverified**. |
| CMP-03 Navigate away/return and full reload | Two selected centres; assess in-app state, fresh mount, and persistence. | Static/manual; component state/page navigation. | **Finding CMP-F-01**; runtime reload/account behavior **unverified**. |
| CMP-04 Detail loading, partial fields, one detail 404/503 | Full, sparse and failing synthetic centre responses; assess merge/fallback/loading/error isolation. | Static/manual; detail fetch/render; backend centre schema. | Branches identified; **unverified** request/UI behavior (safe API/runtime absent). |
| CMP-05 Long content/narrow viewport/horizontal grid | Three verbose synthetic records, 390×844 and 200% zoom; assess operability/clipping. | Manual/static; comparison CSS. | Overflow styles inspected; actual browser **unverified**. |
| CMP-06 Vacancy date across UTC and Asia/Singapore | Synthetic ISO month boundary and invalid value; assess displayed month/year/fallback in both zones. | Static/manual; `new Date` / `en-SG` formatting; backend vacancy schema. | Source behavior observed; **unverified** timezone runtime. |
| CMP-07 Disabled/corrupt storage and missing saved centre | Valid IDs, malformed JSON, read/write exceptions; assess initial state and continued usability. | Static/manual; localStorage paths. | Catch/fallback identified; visible recovery **unverified**. |
| CMP-08 Delayed auth/sign-out/account switch | Two synthetic UIDs with separate watchlist; assess selection reset/separation and timing. | Static/manual; auth listener and comparison state. | **Unverified**: isolated identity/API/browser absent; no server authorization inference. |
| CMP-09 Comparison keyboard/zoom/accessibility | Checkbox names/states, count limit, remove controls, text/non-text contrast, focus; map to AX matrix below. | Manual; comparison controls/cards. | **Unverified**: runtime and exact browser/OS absent. |
| CMP-10 Comparison screen-reader smoke | Same 3-centre fixture; heading order, accessible checkbox state, limit feedback, field relationships and loading/error announcements. | Manual; comparison headings/cards. | **Unverified**: named AT/browser/OS and runtime absent. |

## Reviews and reports — P2

Source/evidence: [reviews-admin.md](reviews-admin.md), frontend `src/api.js`, `src/main.jsx`; backend centre/review/admin-review routes at pinned hash. Synthetic Reviews only. Automated test: [reviews.test.js](../../tests/api/reviews.test.js). Finding IDs REV-13-01 / ADM-13-01 remain unresolved.

| ID / scenario | Setup and expected assessment | Layer / source | Evidence and outcome |
|---|---|---|---|
| RV-01 Public centre Review list | Synthetic centre, partial item and pagination; verify GET/query/response. | Wrapper; `getCentreReviews`; backend centres route/schema. | `reviews.test.js`; **pass** wrapper; UI list **unverified**. |
| RV-02 Own Review lookup | Signed-in synthetic User and pending Review; verify own route/token/status pass-through. | Wrapper; `getMyReview`; backend source. | **Pass** wrapper; empty/404 UI recovery **unverified**. |
| RV-03 Submit Review | Synthetic rating/comment; verify POST body and response. | Wrapper; `submitReview`; backend centre Review schema. | **Pass** transport. |
| RV-04 Validation and duplicate Review | Controlled 422/error; assess caller message and policy without asserting intended validation/duplicate semantics. | Wrapper + static; submit flow/backend schema/ADR 0004. | Error transport **pass**; policy/UI recovery **unverified**. |
| RV-05 Report a Review | Synthetic Review ID/reason; compare wrapper route to backend route inventory. | Wrapper + static; `reportReview`; backend review router. | **Finding REV-13-01**; no matching route in pinned backend. |
| RV-06 List current User's Reviews | Synthetic paginated partial records; verify `/reviews/me` request/response. | Wrapper; `getMyReviews`; backend review route. | **Pass** wrapper; rendered state **unverified**. |
| RV-07 Edit owned Review | Synthetic Review ID and update body; verify encoded PATCH. | Wrapper; `updateReview`; backend route/schema/ADR 0004. | **Pass** wrapper; owner authorization/live write **unverified**. |
| RV-08 Delete owned Review | Synthetic Review ID, controlled 204 and failure; verify DELETE and null/error semantics. | Wrapper; `deleteReview`; backend route/ADR 0004. | **Pass** wrapper; UI confirm/recovery **unverified**. |
| RV-09 Pending/published/moderated visibility | Synthetic PENDING/APPROVED records; compare public/own/admin visibility and state transitions. | Static/manual; frontend Review handling and backend `centres.py`, `admin/reviews.py`, ADR 0004. | **Finding ADM-13-01** for admin action gap; actual UI transition **unverified**. |
| RV-10 Moderation actions and delete | Synthetic admin Review; assess approve/reject/delete availability and errors. | Static/admin wrapper; AdminDashboard and backend admin review router. | Dashboard delete request **pass**; approve/reject absent, **finding ADM-13-01**. |
| RV-11 Review wrapper denial/error/parse paths | 401/403/404/422/500/503, text error, rejected token/fetch, malformed JSON. | Wrapper; shared helper, `reviews.test.js`. | **Pass** supported transport/errors; service auth/UI recovery unverified. |
| RV-12 Review keyboard/responsive/AT | Public, own, submit, edit, report/errors; criterion-level targets below and named screen-reader pass. | Manual; frontend Review UI. | **Unverified**: safe runtime and exact browser/OS/AT versions absent. |

## Administrator access and every operation — P1 gate, P2 operations

Source/evidence: [reviews-admin.md](reviews-admin.md), `src/admin/AdminDashboard.jsx`, `src/admin/adminApi.js`; backend `api/v1/admin/*`, auth/user routes and ADR 0003/0005 at pinned hash. `admin-operations.test.js` uses a synthetic token and controlled fetch; it does not perform writes.

| ID / operation | Setup and expected assessment | Layer / source | Evidence and outcome |
|---|---|---|---|
| AD-01 Access gate / signed out | Controlled protected users-list call and no-user case; assess gate/request; do not infer server security. | Wrapper/static; admin helper and dashboard. | Request path/no-user no-fetch **pass**; backend authorization **unverified**. |
| AD-02 Non-admin denied | Synthetic non-admin token plus controlled 403; assess frontend denial state. | Wrapper/static; admin helper/backend auth/ADR 0005. | Error mapping **pass**; server enforcement and rendered recovery **unverified**. |
| AD-03 Administrator admitted | Synthetic admin token; controlled initial access-list request. | Wrapper/static; dashboard gate. | Request construction **pass**; live role/access **unverified**. |
| AD-04 User search/filter/list | Synthetic query, role and page; assess users GET route/params. | Controlled admin wrapper and static callsite. | `admin-operations.test.js`; **pass** request contract. |
| AD-05 User pagination/reload | Assess first-page limit/offset, whether a next-page control exists, and list refresh. | Static/manual; Dashboard users list. | First-page request **pass**; only initial page is requested and no UI paging control is present. No separate finding was recorded; live reload/render behavior **unverified**. |
| AD-06 Review list page | Synthetic response; assess list GET pagination and pending count. | Controlled wrapper/static; Dashboard. | Request **pass**; only first 50 counted; no paging/filter UI (see ADM-13-01). |
| AD-07 Review permanent deletion | Synthetic encoded ID; controlled DELETE. | Controlled wrapper/static; backend admin Review route. | Request **pass**; confirmation cancellation/error UI **unverified**. |
| AD-08 Review approve/reject | Synthetic pending record; assess status PATCH controls and outcome. | Static; Dashboard + backend admin review route. | Controls absent; **finding ADM-13-01**. No action attempted. |
| AD-09 Source health list | Synthetic status response; GET `/admin/status`. | Controlled wrapper; dashboard/backend status route. | **Pass** request catalog; live source status **unverified**. |
| AD-10 Source refresh | Synthetic refresh response; POST `/admin/status/refresh`; assess confirmation and errors. | Controlled wrapper/static; backend status route. | Request **pass**; cancellation/error/external probe **unverified**. |
| AD-11 ECDA synchronization | Synthetic result; POST `/admin/sync/ecda`; assess explicit confirmation and no accidental trigger. | Controlled wrapper/static; backend sync route. | Request **pass**; no sync ran; cancellation/effects/errors **unverified** (isolated sync target absent). |
| AD-12 Subsidy list | Synthetic list; GET `/admin/subsidy-rules`. | Controlled wrapper/static; backend subsidy schema/route. | Request **pass**; displayed list **unverified**. |
| AD-13 Subsidy create | Synthetic numeric rule; POST JSON; assess validation/cancel/save errors. | Controlled wrapper/static; backend subsidy route. | Request **pass**; no write; UI validation/cancel/recovery **unverified**. |
| AD-14 Subsidy update | Synthetic rule ID containing reserved chars; PUT JSON/encoded path. | Controlled wrapper/static. | Request **pass**; no write; dialog cancel/error **unverified**. |
| AD-15 Subsidy delete | Synthetic ID; DELETE and confirmation cancellation. | Controlled wrapper/static. | Request **pass**; no write; cancel/failure UI **unverified**. |
| AD-16 User profile/role update | Synthetic User ID/body; verify PUT/encoding and allowed role UI. | Controlled wrapper/static; backend user/admin route and ADR 0005. | Request **pass**; no write; cancellation/role effect **unverified**. |
| AD-17 User suspend/deactivate | Synthetic target User; PATCH deactivate; assess confirmation and token/Watchlist consequences. | Controlled wrapper/static; backend auth/user route and ADR 0005. | Request **pass**; no write; confirmation cancel, service enforcement/preservation and failure recovery **unverified**. |
| AD-18 User reactivate | Synthetic suspended User; PATCH reactivate and assess recovery. | Controlled wrapper/static; backend route/ADR 0005. | Request **pass**; no write; service/UI effect and failure recovery **unverified**. |
| AD-19 User delete | Synthetic target User; DELETE and assess self-delete guards/confirmation. | Controlled wrapper/static; backend user/admin route. | Request **pass**; no write; confirmation cancel and failure recovery **unverified**. |
| AD-20 Profile display name | Synthetic profile text; assess Firebase update path, validation and displayed result. | Static/manual; Dashboard + Firebase docs/source. | **Unverified**: isolated Firebase account/runtime missing. |
| AD-21 Email change / recent-auth requirement | Synthetic address; assess Firebase update error and reauthentication. | Static/manual; Dashboard; backend not used for identity update. | **Unverified**: isolated Firebase project/account and browser missing. |
| AD-22 Password change and reauthentication | No password values in fixtures/log; assess current-password credential, length/match validation, recent login errors. | Static/manual; Dashboard. | Source inspected; runtime **unverified**: isolated identity setup required. |
| AD-23 Password reset | Synthetic account; assess reset mail request and visible outcome. | Static/manual; Dashboard/Firebase. | **Unverified**: isolated identity provider and synthetic account absent. |
| AD-24 Admin logout request and Firebase sign-out | Synthetic logout request; assess swallowed API failure and final identity state. | Controlled wrapper/static; admin auth route and Dashboard. | Request **pass**; final sign-out/error UX **unverified**. |
| AD-25 Cancel destructive/refresh/sync dialogs | Cancel each user delete/suspend, Review delete, subsidy delete and source refresh/sync confirmation independently. | Manual; Dashboard dialogs. | No dialog was opened; **unverified**: isolated admin runtime/browser missing. No write occurred. |
| AD-26 Admin operation error recovery | Independently inject 401/403/404/422/5xx and fetch rejection for user list/search, Review list/delete, status list/refresh, ECDA sync, subsidy list/create/update/delete, user update/deactivate/reactivate/delete, and logout; inspect each UI error and retry path. | Wrapper plus manual; helper and each named callsite. | Helper-level denial/error branches **pass**; every per-operation UI error/retry outcome **unverified** (no isolated API/admin runtime). |
| AD-27 Admin focus/keyboard/forms/AT | Access gate, users, Review, source, subsidy/profile dialogs; all applicable WCAG rows below; one screen-reader admin journey. | Manual/static; Dashboard and CSS. | **Unverified**: isolated runtime, browser/OS and AT versions missing. |

Admin helper operation callsite inventory: `GET /admin/users?limit=1&offset=0` gate; `GET /admin/users?limit=50&offset=0&query=…&role=…`; `GET /admin/users?limit=50&offset=0` reload; `GET /admin/reviews?limit=50&offset=0`; `GET /admin/status`; `GET /admin/subsidy-rules`; `DELETE /admin/reviews/{id}`; `POST /admin/status/refresh`; `POST /admin/sync/ecda`; `PUT /admin/users/{id}`; `PATCH /admin/users/{id}/deactivate`; `PATCH /admin/users/{id}/reactivate`; `DELETE /admin/users/{id}`; `POST /admin/subsidy-rules`; `PUT /admin/subsidy-rules/{id}`; `DELETE /admin/subsidy-rules/{id}`; `POST /admin/auth/logout`. These 17 request forms are all asserted through exported `adminApi` in `admin-operations.test.js`. Static callsite review found no admin review-status PATCH call.

## Shared storage, asynchronous state, date/time, and response failures

| ID / scenario | Setup and expected assessment | Layer / source | Evidence and outcome |
|---|---|---|---|
| SH-01 Loading states | Delayed/never-resolving request for auth, directory, profile, Watchlist, Reviews and admin lists; assess visible pending state and duplicate requests. | Static/manual; relevant journey callers. | Wrapper doesn't mount UI; **unverified**: isolated runtime missing. |
| SH-02 Empty states | Empty User/profile/centre/watchlist/notification/review/admin lists; assess explanatory state/action. | Static/manual; journey view code. | Wrapper response where tested **pass**; UI presentation **unverified**. |
| SH-03 HTTP 401 | Controlled unauthorized for applicable wrappers; assess error class/message and caller recovery. | Wrapper/manual; shared/admin helper. | **Pass** wrapper cases; server behavior and rendered recovery unverified. |
| SH-04 HTTP 403 | Controlled forbidden for applicable wrappers; assess response and role denial. | Wrapper/manual. | **Pass** wrapper; does not prove server role enforcement. |
| SH-05 HTTP 404 | Missing route/entity; assess distinct error and not-found recovery. | Wrapper/manual. | **Pass** applicable request propagation; UI recovery unverified. |
| SH-06 HTTP 409 | Duplicate Watchlist Entry; assess conflict surfaced for caller. | Wrapper/static. | **Pass**; product duplicate handling unverified. |
| SH-07 HTTP 422 | Invalid payload across profile, Review, watchlist/admin paths; assess validation error propagation. | Wrapper/manual. | **Pass** where exported tests cover; rendered field mapping unverified. |
| SH-08 HTTP 5xx | Controlled 500/503 across wrapper families; assess error propagation and no automatic write retry. | Wrapper. | **Pass**; service recovery unverified. |
| SH-09 Text/non-JSON response | Text success/error, empty 204; assess parse contract per shared/admin helper. | Wrapper. | **Pass** supported paths; helper differences preserved. |
| SH-10 Malformed JSON/partial payload | Invalid JSON parse and partial/malformed success objects; assess propagated parse failure/pass-through. | Wrapper. | **Pass** specified behavior; caller validation/UI handling unverified. |
| SH-11 Rejected fetch | Synthetic network rejection; assess error mapping and no write retry. | Wrapper. | **Pass** supported helper branches; real network behavior not tested. |
| SH-12 Async auth race | Delayed Firebase auth restoration while data calls start; assess signed-out flash/request ordering/account contamination. | Static/manual; auth state and API calls. | **Unverified**: no Firebase initializer/browser runtime. |
| SH-13 Local storage disabled | Throwing read/write for profile, legacy Watchlist, alert state and comparison. | Static/manual; storage callsites. | Guards inspected in slice reports; effect on visible state **unverified**. |
| SH-14 Corrupt local JSON | Invalid strings for profile/watchlist/alerts/comparison; assess fallback and data retention. | Static/manual. | Fallback paths identified; browser behavior **unverified**. |
| SH-15 Dates and timezone | Enrollment/vacancy/alert/admin date values across UTC, Asia/Singapore, month boundary, invalid date. | Static/manual; relevant date paths and backend schemas. | Source comparisons recorded; controlled timezone/clock/browser **unverified**. |

## Accessibility: WCAG 2.2 AA criterion register

All rows apply to each named journey as relevant, and are required in Chrome desktop 1440×900, Firefox desktop 1440×900, and Safari mobile 390×844, with exact browser and OS/iOS versions recorded. Repeat zoom/reflow checks at 200%. Each combination is **unverified** because no safe app runtime or named browser session/version was available. These are manual checks, not a conformance certification. Use the WCAG 2.2 Recommendation (2023-10-05) criterion identifier/edition as the evidence source. Capture journey, control/state, viewport, browser/OS and outcome in future evidence. `AT-01` adds a named screen reader/browser/version for auth, directory/search, and one administrator journey; no AT was supplied.

| ID / criterion | Individual acceptance assessment | Browser/viewport and outcome |
|---|---|---|
| AX-01 — 1.3.1 Info and Relationships | Labels, headings, lists, table/grid row/column relationships and form groups are programmatically determinable. | All three required pairs and 200% zoom: **unverified**, exact browser/OS and isolated UI absent. |
| AX-02 — 1.4.3 Contrast (Minimum) | Text and images of text meet AA contrast ratios in each state, including disabled/error/focus where applicable. | All three pairs: **unverified**; no rendered palette/state assessment. |
| AX-03 — 1.4.4 Resize Text | Text resizes to 200% without loss of content/function. | Chrome/Firefox 1440×900 and Safari 390×844 at 200%: **unverified**. |
| AX-04 — 1.4.10 Reflow | At equivalent 320 CSS px width, content reflows without two-dimensional scrolling except permitted content; comparison data assessed separately. | Three named pairs plus 200% zoom: **unverified**. |
| AX-05 — 1.4.11 Non-text Contrast | Controls, focus indicators and meaningful graphics meet required contrast against adjacent colors. | All three pairs: **unverified**. |
| AX-06 — 1.4.12 Text Spacing | User text-spacing overrides do not clip/overlap or hide content/function. | All three pairs: **unverified**; no rendered override test. |
| AX-07 — 2.1.1 Keyboard | All functionality operates by keyboard, including filters, pagination, cards, dialogs and destructive actions. | All three pairs: **unverified**. |
| AX-08 — 2.1.2 No Keyboard Trap | Focus can move into/out of dialogs, menus, map controls and widgets by keyboard. | All three pairs: **unverified**. |
| AX-09 — 2.4.3 Focus Order | Focus order preserves meaning and operability through each journey. | All three pairs: **unverified**. |
| AX-10 — 2.4.7 Focus Visible | Keyboard focus indicator is visible for each interactive component. | All three pairs: **unverified**. |
| AX-11 — 2.4.11 Focus Not Obscured (Minimum) | Focused component is not entirely hidden by sticky/header/dialog overlays. | All three pairs: **unverified**. |
| AX-12 — 2.5.8 Target Size (Minimum) | Pointer targets meet 24×24 CSS px or a documented exception. | All three pairs: **unverified**. |
| AX-13 — 3.3.1 Error Identification | Input errors identify the field/item and error in text. | Auth/profile/review/admin forms in all three pairs: **unverified**. |
| AX-14 — 3.3.2 Labels or Instructions | Inputs have visible/programmatic labels and required-format instructions. | All relevant forms in all three pairs: **unverified**. |
| AX-15 — 4.1.2 Name, Role, Value | Custom/native controls expose correct accessible name, role, state/value and changes. | All three pairs: **unverified**. |
| AX-16 — 4.1.3 Status Messages | Loading, result count, validation, denial and save/error messages are announced without forced focus. | All three pairs: **unverified**. |
| AT-01 — Screen-reader smoke: authentication | Read auth labels/errors/status and verify focus/order using named AT/browser/version. | AT/browser/OS version and isolated runtime absent: **unverified**. |
| AT-02 — Screen-reader smoke: directory/search | Read search/filter, result count, list/detail, loading/error state using named AT/browser/version. | AT/browser/OS version and isolated runtime absent: **unverified**. |
| AT-03 — Screen-reader smoke: administrator | One user/review/subsidy journey including dialog, denial and status updates. | AT/browser/OS version and isolated runtime absent: **unverified**. |

The matrix's cross-journey visual/manual requirement is applied to directory, profile, Watchlist/alerts, comparison, Review, and Administrator journey rows above. The account report's combined screen-reader row maps to AT-01; DIR-18 to AT-02; AD-27 to AT-03. No individual criterion is recorded as a pass.

## Performance — P2

Required synthetic fixture family `KCM-PERF-01` and cold/warm distinction are defined in [comparison-performance.md](comparison-performance.md). The checks below are unverified; no app/backend/browser was launched and no timing was collected. For every run, record every metadata field listed in the last column; current state is missing for every field because no performance run occurred.

| ID / scenario | Workload and expected measurement | Layer/source | Outcome and missing metadata |
|---|---|---|---|
| PERF-01 Directory cold/warm | Fixed synthetic directory; navigation-to-populated, request/paint trace and main-thread work; separate cold/warm. | Manual performance trace; directory path in `src/main.jsx`, shared wrapper. | **Unverified**: no isolated API/Firebase/browser/tool. Missing revision/build evidence link for a run, hardware/CPU, OS, browser/version, measurement tool/version, network/CPU throttling, dataset size/content, cache state, repetitions and raw timings. |
| PERF-02 Centre detail cold/warm | Fixed centre detail with services/vacancies/review summary; action-to-populated and request versus render time; separate cold/warm. | Manual performance trace; detail code and backend schema. | **Unverified**: same missing prerequisites/metadata as PERF-01; no isolated service/browser. |
| PERF-03 Matching cold/warm | Fixed home/work/level/citizenship/profile weights; action-to-ranked results, detail request count, main-thread trace; separate cache conditions. | Manual trace; local ranking and backend matching distinction. | **Unverified**: same missing metadata; backend algorithm not executed. No score threshold imposed. |

## Build, dependencies, artifacts, and documentation — P2

Evidence: [build-reproducibility.md](build-reproducibility.md), root/nested manifests, lockfiles, entrypoints, `firebase.json`, tracked dist, README and env key names. Static frontend source at `64437a2`; no secret values copied.

| ID / scenario | Setup and expected assessment | Layer/source | Evidence and outcome |
|---|---|---|---|
| BUILD-01 Root package/toolchain reproducibility | Inspect manifest vs lock and runtime pin declarations; assess floating `latest` versions. | Static; root `package.json`/lock. | **Finding F-15-01**; exact Node/npm used for this audit are in [index](README.md#authority-and-reviewed-revisions). |
| BUILD-02 Root vs nested package ownership | Compare package manifests, lockfiles, entrypoints/config/build targets and tracked/ignored `dist`. | Static; root and `kidcare-match/`; `firebase.json`. | **Finding F-15-02**; external pipeline/deployment owner **unverified**. |
| BUILD-03 README install/run instructions | Compare commands, scripts, Node engine and clean lockfile path. | Static; `README.md`, `package.json`, lock. | **Finding F-15-03**. |
| BUILD-04 README integration accuracy | Compare Firebase/API implementation with README claims. | Static; `README.md`, `src/firebase.js`, wrappers, admin README. | **Finding F-15-04**; connectivity not inferred. |
| BUILD-05 User/admin API configuration | Compare `VITE_API_URL` vs `VITE_API_BASE_URL`; inspect key names and file locations without revealing values. | Static; shared/admin wrappers and tracked env-file names. | **Finding F-15-05**; target availability not tested. |
| BUILD-06 Clean install and root build | Curated disposable copy with lockfile and source; synthetic invalid API bases; assess `npm ci` + build without touching tracked dist. | Build reproducibility evidence in [build report](build-reproducibility.md). | **Pass** in the recorded Windows Node/npm environment; build warning and scope limitations are in the slice. This ticket's fresh `npm ci` and tests are separately recorded in README. |
| BUILD-07 Nested package install/build | Assess independent lock/runtime/build and configured deployment relationship. | Static/manual; nested package. | **Unverified**: no nested installation/build; ownership unresolved F-15-02. |
| BUILD-08 Tracked root dist freshness | Compare generated output from current source to committed artifacts and active deployment. | Static/manual; root `dist`, `firebase.json`. | Target is statically known; freshness/production use **unverified**. No artifact overwritten. |

## Scenario coverage accounting

This final register individually expands the approved issue #6 matrix's account/auth, administrator boundary and operations, directory/detail/map, profile/matching, watchlist/alerts, comparison, Review/report, shared failure/storage/date/async, accessibility/browser/AT, performance, and build/dependency/documentation rows. Priorities are P1/P2 as approved; accessibility, storage/date and shared failure scenarios inherit the parent journey priority. No family is omitted because it was not runnable. Unavailable evidence is explicitly unverified above.
