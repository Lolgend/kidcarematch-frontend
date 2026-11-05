# Frontend audit evidence index

Status: complete for the approved evidence baseline; unresolved findings and unavailable manual/runtime evidence remain open.

## Authority and reviewed revisions

This index implements the named-scenario requirement in the approved [audit and testing plan](../plans/frontend-audit-and-testing-plan.md) and the acceptance matrix in [issue #6](https://github.com/Lolgend/kidcarematch-frontend/issues/6#issuecomment-6663808737). It is the entry point for the audit slices and the individual scenario register in [scenarios.md](scenarios.md). The immutable plan is authoritative for boundaries, classifications, and procedure.

| Evidence | Revision / environment | Scope |
|---|---|---|
| Frontend application source | `64437a2afaecdec13f580b166348a53745eba132`; the audit worktree is based on integration tip `64ffbcb5d6724feb0fbf67d08c4ea59be30740b8`. Source files were not changed by the audit slices. | Root Vite app, shared/admin wrappers, static journey review. |
| Backend contract evidence | Read-only sibling checkout HEAD `db7fef7cc0e8691c83fc49623212ef35093c11d7`, rechecked during ticket 16. | Routes, schemas, ADRs, and algorithm sources cited by slice reports. No backend tests or services were run. This pins inspected source only; deployed routing/behavior remains unverified. |
| Local wrapper test environment | Windows; Node `v24.14.0`, npm `11.9.0`, Vitest `3.2.4`, `@vitest/coverage-v8` `3.2.4`. | Synthetic fixtures, mocked Firebase, `.invalid` hosts, fail-closed fetch. Both `VITE_API_URL` and `VITE_API_BASE_URL` are set before wrapper imports. |
| Hosted CI | GitHub Actions run [42082408128](https://github.com/Lolgend/kidcarematch-frontend/actions/runs/42082408128), commit `64ffbcb5`; Ubuntu runner, Node `24.14.0`, npm `11.9.0` per [workflow](../../.github/workflows/frontend-tests.yml). | Unit and coverage jobs each passed 84 tests / 6 files. Artifact [frontend-wrapper-test-and-coverage](https://github.com/Lolgend/kidcarematch-frontend/actions/runs/42082408128/artifacts/13441231627) contains 14 files (28,231 bytes). |

## How to read outcomes

Every row in [the individual scenario register](scenarios.md) carries priority, synthetic setup/provenance, expected assessment, layer, pinned source, exact available environment or missing prerequisite, evidence pointer, and one outcome: **pass**, **finding**, or **unverified**. A wrapper pass is limited to request/response behavior. Static findings describe inspected source and do not establish product intent. An unverified row names the unavailable identity, safe API, browser, storage/clock, assistive technology, or performance prerequisite. Shared environment/source details are inherited only where the scenario table explicitly points here.

The backend checkout was at the same hash as the earlier pinned snapshot. Auth/user role and ownership paths, centre/profile/watchlist/review/admin routes and schemas, and ADRs 0003–0007 were re-opened read-only at that hash. This revalidates source references, not live service compatibility. Backend evidence is linked from slice reports and scenario rows; no backend service, write, test, or external probe was used.

## Test totals and coverage

Fresh local commands on this ticket worktree:

| Command | Result |
|---|---|
| `npm ci` | Completed; 212 packages installed from the committed lockfile. npm emitted a deprecation notice for transitive `glob@10.5.0`. |
| `npm run test:unit` | 84 passed, 6 files passed. |
| `npm run test:coverage` | 84 passed, 6 files passed. |

The coverage report includes both exported request wrappers and no application UI/private helpers:

| Scope | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Both wrappers | 100% | 97.8% | 100% | 100% |
| `src/api.js` | 100% | 98.36% | 100% | 100% |
| `src/admin/adminApi.js` | 100% | 96.66% | 100% | 100% |

Local runtime output under `coverage/` and `test-results/` is disposable run output and is not committed. Hosted CI retains its own test/coverage artifact as linked above. Coverage is wrapper-only and is not an application-wide confidence measure. CI is an actual successful run, not an unavailable gap.

## Exported-operation and administrator callsite inventory

All 25 shared `src/api.js` exports are covered by wrapper tests, as detailed in [scenarios.md](scenarios.md): `apiRequest`; `getCentres`, `getDistricts`, `getCentreSummary`, `getCentreById`, `getCentreByCode`; `getCentreReviews`, `getMyReview`, `submitReview`, `reportReview`; `getMyProfile`, `createMyProfile`, `updateMyProfile`; `getFamilyProfiles`, `createFamilyProfile`, `updateFamilyProfile`; `getNotifications`, `markNotificationRead`, `markAllNotificationsRead`; `getMyWatchlist`, `createWatchlist`, `deleteWatchlist`; `getMyReviews`, `updateReview`, `deleteReview`.

The single exported admin helper, `adminApi`, is exercised for all dashboard request callsites: access gate; user search/filter/list; review list/delete; source status/refresh; ECDA sync; subsidy list/create/update/delete; user role/profile update, deactivate/reactivate/delete; logout. Operation request construction is controlled-fetch evidence. Cancellation, user-visible failure recovery, and safe writes remain unverified. The test asserts no service effect.

## Consolidated unresolved findings

IDs link to the detailed evidence in each slice. Severity and confidence are independent; statuses remain unresolved unless stated otherwise. No fixes or product-intent decisions were made.

| Finding | Classification | Severity / confidence | Status and scenario links |
|---|---|---|---|
| [F-AUTH-01](accounts.md#f-auth-01--signup-can-report-success-after-backend-profile-creation-fails) | Observed behavior; intent unresolved | Moderate / high for control flow, low for defect interpretation | Unresolved; account creation and partial signup. |
| [F-AUTH-02](accounts.md#f-auth-02--authentication-denials-have-wrapper-evidence-but-no-user-recovery-evidence) | Evidence gap | Moderate / high for wrapper evidence, low for rendered recovery | Unresolved gap; auth denial and recovery. |
| [F-AUTH-03](accounts.md#f-auth-03--a-json-null-error-body-throws-while-formatting-the-shared-api-error) | Observed behavior | Low / high | Unresolved; malformed shared error response. |
| [FFP-01](family-profiles.md#static-source-findings) | Contract mismatch | Moderate / high | Unresolved; profile collection/lifecycle scenarios FP-03/04/08/09. |
| [FFP-02](family-profiles.md#static-source-findings) | Contract mismatch and algorithm difference | Moderate / high | Unresolved; conversions, weights, ranking scenarios FP-05/06/07/10. |
| [W-01](watchlist.md#w-01--browser-wide-legacy-watchlist-is-merged-into-each-signed-in-account) | Suspected bug | Medium / high source confidence, medium impact confidence | Unresolved; W-S04/05, shared account/storage scenarios. |
| [W-02](watchlist.md#w-02--notification-wrappers-target-routes-absent-from-the-pinned-backend) | Contract mismatch | Low / high for pinned source; deployment unverified | Unresolved; W-S08/09/10. |
| [W-03](watchlist.md#w-03--local-vacancy-alerts-and-their-read-state-are-browser-derived-not-server-notifications) | Observed behavior | Low / high for source behavior, low for intended semantics | Unresolved semantics; W-S07/08/09/14. |
| [REV-13-01](reviews-admin.md#rev-13-01--review-report-wrapper-has-no-matching-backend-operation) | Contract mismatch | Moderate / high for inspected revisions | Unresolved; RV-05. |
| [ADM-13-01](reviews-admin.md#adm-13-01--administrator-dashboard-does-not-expose-review-approvalrejection) | Observed behavior | Moderate / high for source | Unresolved; RV-06 and AD-04. |
| [CMP-F-01](comparison-performance.md#cmp-f-01--comparison-selection-does-not-survive-a-fresh-app-mount) | Observed behavior | Low / high for source, low for intent | Unresolved; CMP-03/08. |
| [F-15-01](build-reproducibility.md#f-15-01--root-dependency-manifest-leaves-core-tool-versions-floating) | Observed behavior | Medium / high | Open; root toolchain. |
| [F-15-02](build-reproducibility.md#f-15-02--root-and-nested-packages-have-unclear-sourcedeployment-ownership) | Observed behavior | Medium / high for repository config, medium for external ownership | Open; root/nested build and deployment. |
| [F-15-03](build-reproducibility.md#f-15-03--readme-run-instructions-do-not-describe-the-available-reproducible-install-path) | Observed behavior | Low / high | Open; runbook accuracy. |
| [F-15-04](build-reproducibility.md#f-15-04--general-readme-describes-an-integration-state-inconsistent-with-current-source) | Observed behavior | Medium / high | Open; integration documentation. |
| [F-15-05](build-reproducibility.md#f-15-05--backend-api-configuration-has-two-variable-names-and-two-tracked-env-file-locations) | Observed behavior | Medium / high for variable split, medium for runtime impact | Open; API configuration. |

The specific findings stay unresolved and do not prevent completion of evidence collection. Scenario rows preserve their separate pass/finding/unverified outcomes.

## Manual prerequisites and explicit limits

No UI was launched and no browser, Firebase identity provider, backend/API, map integration, browser storage, or clock was exercised. The clean-checkout manual runbook prerequisites are:

1. Use a disposable checkout and a verified isolated non-production Firebase project and API/database; verify every configured request/write destination before launching the app. The source-defined Firebase client configuration alone does not prove isolation.
2. Create two synthetic Parent identities (A and B) and one synthetic Administrator through the approved non-production identity/role provisioning path. Confirm active roles server-side without copying tokens into notes. Do not grant roles or write records in production.
3. Seed only synthetic Preschool Centres, profiles, Watchlist Entries, vacancy states, Reviews and admin rules needed for the selected scenario. Record fixture provenance and a reset method; use a disposable database reset or delete only those named synthetic records after the run. Clear the dedicated browser profile's auth session and relevant local storage between account-bound scenarios.
4. Disable optional integrations (map/geocoding, external sync, notification delivery and other external calls) unless each has a verified isolated stub/target. Do not click sync/refresh/write controls until their synthetic target and reset path are confirmed. If a journey requires a disabled service, mark it unverified.
5. Capture app commit/build, exact browser/OS/iOS and assistive-technology versions, viewport and sanitized evidence location. Current exact browser/OS/AT versions and isolated service credentials/configuration are missing, so manual scenarios remain unverified.

Never put secrets or production configuration into evidence. If a safe target cannot be verified, do not launch the app; retain the scenario as unverified.

Exact Chrome, Firefox, Safari/iOS, screen-reader/browser/OS versions, and accessibility tool versions are missing. Therefore each WCAG/browser/viewport/AT scenario in the register is **unverified**, not passed. No accessibility conformance claim is made. Performance metadata (hardware/CPU, browser/OS, tool/version, network and throttling, build/commit, dataset size/content, cold/warm/cache state, repetitions/raw measurements) is absent because no runtime trace was collected; all performance runs are unverified and have no score gate. Deployment ownership, tracked `dist` freshness, nested-package build, live API compatibility, server authorization, external notification delivery, and cross-engine ranking equivalence remain unverified.

## Scope and local clean-checkout procedure

From the root frontend checkout use Node `v24.14.0` and npm `11.9.0`, then run `npm ci`, `npm run test:unit`, and `npm run test:coverage`. These commands require no credentials, service, browser, or network endpoint. Tests mock Firebase at the module boundary, set both API bases to `.invalid` hosts before evaluation, and reject unexpected fetch requests. Keep generated JUnit and coverage output as run artifacts; do not commit it or overwrite tracked `dist/`.

No source fixes, app/config changes, dependency upgrades, backend changes, service launches, production probes/writes, issue edits, or issue closure occurred. The approved parent issue remains open as instructed.
