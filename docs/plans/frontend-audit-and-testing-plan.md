# Frontend audit and testing plan

Status: **Approved by the user** (2026-11-06; live review response: “Looks good”). Approval ticket: [Approve the frontend audit and testing plan spec](https://github.com/Lolgend/kidcarematch-frontend/issues/7). Map: [Plan the frontend audit and testing baseline](https://github.com/Lolgend/kidcarematch-frontend/issues/1).

This document specifies later work. No audit execution, dependency installation, tests, application changes, or fixes have been performed to produce it. Approval of this plan does not authorize product changes.

## Objectives and boundaries

Produce a repeatable frontend baseline covering correctness, security/privacy, API compatibility, accessibility, performance, dependency/build reproducibility, maintainability, and documentation accuracy. Every agreed journey/risk must have traceable evidence or an explicit gap. Preserve existing UI and application logic.

The root Vite application is the primary target. Inventory the nested `kidcare-match/` package and tracked `dist/` assets to establish their relationship to build/deployment configuration; do not remove or rewrite them. The sibling backend is read-only contract evidence, not an audit target. Production probing, credentials, data writes, deployment, dependency upgrades, remediation, source refactoring, and a full backend audit are excluded.

Use the domain terms Preschool Centre, Family Preference Profile, Watchlist Entry, Review, User, Firebase UID, and Administrator from the contract research. Keep locally derived vacancy alerts distinct from server-persisted notifications, and frontend ranking distinct from backend matching. Neither pair is assumed equivalent.

## Authority and inspected revisions

Closed decision resolutions govern this plan. Research recommendations are evidence, and do not override later user decisions.

| Source | Authority and use |
|---|---|
| [Research frontend behavior and backend contract boundaries](https://github.com/Lolgend/kidcarematch-frontend/issues/2#issuecomment-6663123658) | [Pinned source inventory](https://github.com/Lolgend/kidcarematch-frontend/blob/7c3d5ab52c721c6ddedc490f8ff15c0548295ff0/docs/research/frontend-contract-boundaries.md); journey, contract and uncertainty evidence. |
| [Research behavior-preserving test and audit approaches](https://github.com/Lolgend/kidcarematch-frontend/issues/3#issuecomment-6663072521) | [Pinned primary-source comparison](https://github.com/Lolgend/kidcarematch-frontend/blob/2f7009e4ee6cf4f53b135a61073c11ad7f6ac4ce/docs/research/behavior-preserving-test-and-audit-approaches.md); alternatives and technical constraints. Its Playwright recommendation was superseded by the layer decision. |
| [Choose baseline test layers and execution environments](https://github.com/Lolgend/kidcarematch-frontend/issues/4#issuecomment-6663479847) | Canonical decision on automation, isolation, allowed files and trade-offs. |
| [Choose audit evidence and finding triage criteria](https://github.com/Lolgend/kidcarematch-frontend/issues/5#issuecomment-6663670978) | Canonical decision on evidence, finding format, safety and acceptance. |
| [Set journey, browser, and accessibility acceptance matrix](https://github.com/Lolgend/kidcarematch-frontend/issues/6#issuecomment-6663808737) | Canonical scenario matrix, environments, priorities, outcomes and CI gates. Expand its rows during implementation; do not replace it with a conflicting matrix. |

Draft consolidation inspected frontend checkout `7c3d5ab52c721c6ddedc490f8ff15c0548295ff0`, including manifest, wrapper imports and tracked-file inventory. Its application source originates at `fc31f7211c1b07eb9c010357f255425c5b30de87`; the later commit adds research documentation. The sibling backend currently reports `db7fef7cc0e8691c83fc49623212ef35093c11d7`. The earlier contract note did not pin a backend revision: this current identifier must not be represented as proof of the earlier research's checkout. Revalidate cited backend paths/contracts against a recorded revision when executing the audit. Tooling evidence is pinned separately above.

No frontend glossary or ADR was found in the documented research snapshot. Backend ADRs referenced there cover authentication, reviews, administration, Family Preference Profiles and matching. Record implementation/ADR disagreements explicitly rather than treating either as frontend product approval.

## Architecture and API boundaries

`src/main.jsx` owns orchestration, private helpers, Firebase authentication and browser storage. `src/api.js` exports shared requests; `src/admin/adminApi.js` exports administrator requests. `src/firebase.js` initializes Firebase. The administrator dashboard's access gate is client behavior, not evidence of server authorization.

Shared requests read `VITE_API_URL`; administrator requests read `VITE_API_BASE_URL`. Audit their consistency without changing either. Compare request methods, routes, query encoding, headers/tokens, bodies, response schemas and errors against backend routes/schemas and relevant ADRs. Backend test examples are supplementary evidence, not proof of frontend behavior.

Carry these research uncertainties into findings or gaps: notification route availability and local fallback; own-review route compatibility; profile conversion/local-server disagreement and ranking differences; legacy watchlist/account separation; asynchronous authentication; map dependencies; and root/nested build ownership. Source observations do not settle intended product behavior.

## Test architecture and tooling

Required automation uses **Vitest in Node** against existing exports in `src/api.js` and `src/admin/adminApi.js`. No rendered UI suite, browser automation, Firebase initialization, backend process, credentials, or storage/clock controls are required.

Both modules import Firebase. Mock `src/firebase.js` at the test-module boundary before importing either wrapper, exposing only synthetic `auth.currentUser` and token-method behavior. Do not import the real initializer or add a source seam. Set both API-base environment variables to synthetic non-routable test destinations before module evaluation; reset modules/environment when testing missing configuration. Replace global `fetch` with a fail-closed mock: every expected request has an explicit response and every unexpected request fails. Do not start network-capable services in this suite. Restore mocks and isolate mutable fixtures between cases.

Cover each exported operation's method/path/query/body/header behavior and supported response/error handling. Include token/no-user/token-rejection cases as applicable, success, JSON/text responses, 204, HTTP failures and rejected fetch. Use 401/403/404/422/5xx, partial/malformed payloads and parse failures where the wrapper supports those paths. Match distinct shared/admin behavior rather than imposing identical semantics. Flag questionable behavior for user decision instead of silently establishing it as a requirement.

Fixtures contain synthetic centres, profiles, accounts, watchlists, notifications and reviews. Record whether each shape comes from frontend expectations or inspected backend contracts; a fixture is not contract proof. No personal data, actual bearer tokens or saved authentication state may enter fixtures or reports.

| Alternative | Disposition and trade-off |
|---|---|
| Vitest wrapper tests with controlled fetch | Chosen: existing seams, fast deterministic CI, independent of live backend/Firebase. Does not exercise UI orchestration or prove backend contracts. |
| React Testing Library / simulated DOM | Not required: reaching private components/helpers would encourage forbidden source changes; simulated browser behavior adds separate limitations. |
| Playwright browser journeys | Not required: broader orchestration confidence was traded for a smaller baseline and manual UI evidence. No browser binaries or automation dependencies are required. |
| Firebase Emulator, contract or real-service integration | Optional, disabled by default, outside required CI. Separate safe configuration and evidence are needed; inability to isolate without source edits is a gap requiring a user decision. |
| Automated accessibility/performance tooling | Optional supporting evidence. Manual accessibility checks remain required; initial performance measurements have no score gate. No mandatory new tool installation is implied. |

At implementation, select compatible exact Node/npm, Vitest and coverage-provider versions, record them, and commit the lockfile. This draft does not claim compatibility has been tested or authorize upgrades to existing application dependencies. If tooling cannot fit those constraints, return to a decision ticket.

## Journey/risk execution index

The linked acceptance-matrix resolution holds the detailed scenarios and acceptance checks. This index maps its full scope to the later execution sequence; it does not supersede those details.

| Journey/risk | Priority | Required evidence |
|---|---|---|
| Account lifecycle/authentication | P1 | Supported wrapper requests/errors; manual signup/signin/Google/signout/init/reload/account-switch and failure states in isolated identity setup. |
| Administrator access boundaries | P1 | Static contract comparison, controlled wrapper denials, manual gate/recovery; server authorization explicitly unverified without independent integration evidence. |
| Directory/search and centre detail | P1 | Wrapper requests/errors; manual populated/empty/filter/pagination/detail/map and recovery states; static field/default comparison. |
| Family Preference Profile and matching | P1 | Supported wrappers; manual/static conversions, save/edit/reload, local/server differences, ranking/explanations and account separation. |
| Watchlist and vacancy alerts | P1 | Supported wrappers; manual/static add/remove/duplicates/legacy/reload/account-switch/fallback/read-state/persistence checks. |
| Comparison | P2 | Manual/static selection/removal, navigation/reload, partial fields and narrow viewport. |
| Reviews and reports | P2 | Supported wrappers plus manual/static submit/edit/report/delete where exposed, duplicates, validation, moderation and failed-write recovery. |
| Administrator operations | P2 | Every exported operation; manual/static users, reviews, sources, subsidies, profile/security, reauthentication, confirmation cancellation and errors using synthetic records. |
| Shared failures and storage | Journey priority | Applicable loading/empty/error/signed-out states and API failures; manual/static corrupt/disabled storage, asynchronous auth, date/timezone and malformed-data cases. |
| Accessibility/responsiveness | Journey priority | All journeys: keyboard, visible focus, labels/errors, dialog focus, contrast and 200% zoom. Screen-reader smoke checks for auth, directory/search and one administrator journey. |
| Performance | P2 | Representative directory/detail and matching measurements when safely runnable; fixed synthetic dataset and documented cold/warm conditions. |
| Build/dependencies/maintainability/documentation | P2 | Root lockfile/config/source, nested package, tracked artifacts, deployment/config references and reproducible procedure evidence. |

P1 runs first; P2 remains required. Expand each row into named scenarios with priority, fixture/setup, expected acceptance check, layer, source reference, environment/version, evidence link and outcome: **pass**, **finding**, or **unverified**. Findings link their record; unverified scenarios name the missing prerequisite. Expected checks assess behavior; suspicious observed behavior is not automatically correct.

Manual environments are desktop Chrome and Firefox at **1440x900**, plus mobile Safari at **390x844**, recording exact browser/OS versions. Missing environments are gaps. Apply relevant WCAG 2.2 AA criteria with edition/source/applicability recorded; this is not full conformance certification. Record screen-reader/version. Performance evidence records commit/build, hardware, browser, tool/version, network/CPU conditions, dataset and cache state; report measurements without an arbitrary score gate.

## Audit procedure and findings

1. Record frontend/backend revisions, working-tree status, environment/tool versions and artifact inventory. Recheck evidence drift before relying on earlier research.
2. Review source/configuration/contracts statically across every agreed category and journey. Inventory nested package and tracked build output without assuming deployment ownership or deleting anything.
3. Capture candidate findings with source/line references. Compare implementation, documented contracts and ADRs; distinguish facts, recommendations, user decisions and assumptions.
4. Perform only the agreed safe runtime/manual checks. Verify the entire service configuration is isolated and non-production before launching the app: API, Firebase, map/other external requests and write targets. Signed-out UI can still issue requests. If isolation needs forbidden source changes or cannot be verified, stop that check and record a gap. Never use production as a fallback.
5. Run the later wrapper suite and record reports. Reconcile every scenario with evidence or a gap; retain unresolved findings for the user.

Each finding records: concise title; category; affected journey/component; classification (observed behavior, contract mismatch, suspected bug, or confirmed requirement); evidence with revision/source/version references; reproducible steps or reason reproduction is unavailable; impact; severity; confidence; and status. Keep severity separate from confidence and explain their rationale. Dependency/build/documentation/artifact findings identify the exact lockfile, build or document mismatch. Cite standards only where applicable. Redact credentials and personal data.

No finding is fixed as part of this baseline. A finding can remain unresolved while baseline evidence collection is complete; neither closure nor passing CI is product acceptance of that behavior.

## Later implementation sequence and allowed files

After human approval and a separate implementation request:

1. Revalidate revisions, installed-tool compatibility and the source boundary; establish the named scenario/evidence register and static inventory.
2. Add only test tooling/configuration, synthetic fixtures, wrapper tests and documentation. Validate missing-config, Firebase-mock and fail-closed fetch isolation before broadening tests.
3. Cover shared/admin exported operations, request shapes and failure paths; generate test/coverage reports.
4. Add CI using the same install/test commands as local. Verify deterministic results without retry masking and verify source scope is unchanged.
5. Execute the static audit and safe manual matrix, P1 then P2. Publish findings, evidence, environment details and explicit gaps.

Allowed later modifications: test-only dependencies/scripts in `package.json` and `package-lock.json`; new `vitest.config.js`; tests/fixtures under `tests/`; `.github/workflows/frontend-tests.yml`; and testing/audit documentation under `docs/`. Test/coverage outputs should be retained as run artifacts rather than application build artifacts.

Do not edit `src/`, application assets/styles/HTML, Firebase application configuration, the nested package, existing application dependencies, tracked `dist/`, or backend files. Do not expose private helpers or refactor for tests. If implementation needs a wider file scope, surface that as a new decision before acting.

## Local and CI runbook contract

These are proposed scripts to add during implementation, not commands claimed to exist today:

```text
npm ci
npm run test:unit
npm run test:coverage
```

Define `test:unit` as non-watch `vitest run`, and `test:coverage` as `vitest run --coverage`. Use the same committed lockfile and pinned Node/npm/tool versions locally and in CI. Use a compatible Vitest coverage provider, collecting both wrapper modules even if unimported; report wrapper scope and full-application exclusions clearly. Keep execution serial initially and do not use retries to conceal intermittency. Document clean-checkout prerequisites and precise versions once selected; if lockfile install fails, report a reproducibility finding rather than quietly upgrading runtime packages.

Required CI runs lockfile installation and deterministic wrapper tests, and retains test totals and coverage reports. No production secrets, Firebase initialization, backend connectivity, manual UI checks or performance scores belong in required CI. Runtime application builds and manual checks belong to the separately recorded audit procedure; use an isolated disposable checkout/output location so building cannot overwrite tracked `dist/` evidence. A build succeeding does not prove journeys work. Document any safe build failure as evidence; do not fix application code.

Manual run documentation must record verified non-production API/Firebase setup, synthetic account roles and reset steps, fixture provenance, browser/OS/assistive technology versions, app revision/build, scenario steps, results and sanitized evidence locations. Unavailable configuration yields unverified journeys. Optional integration layers get separate commands and are off by default.

## Acceptance, coverage policy and reserved decisions

The later baseline is complete when all agreed matrix scenarios have linked outcomes/evidence or explicit gaps; local/CI instructions are repeatable; required wrapper tests pass deterministically; test totals and initial coverage are reported; and findings/limitations remain visible. Missing evidence is never a pass. No arbitrary code-coverage percentage, performance score, or automatic finding-free gate is imposed.

Report statement/branch/function/line coverage for the wrapper scope, along with excluded UI/private helpers and the manual scenario register. Do not describe wrapper coverage as whole-application confidence. Manual checks can drift and are not exercised on every change. This baseline does not establish real-service reliability, full accessibility conformance, cross-browser coverage beyond the named environments, server authorization, external notification delivery, or agreement between frontend and backend matching.

Product intent for suspected bugs, remediation priorities, new source seams, broader automation, dependency upgrades and optional integrations remain future user decisions. Deployment ownership and runtime availability remain evidence to collect, not prerequisites silently assumed satisfied. Static-only findings need runtime confirmation only where the agreed check requires it; otherwise retain the limitation explicitly.

Before approving this spec, any newly identified in-scope policy/design decision must become a child decision ticket of the map and block approval. This draft identifies no additional policy choice beyond approval of this consolidation; unverified implementation facts above are handled by the already agreed gap policy. The user may require further decisions during review.

On explicit human approval, preserve an immutable, commit-addressed copy of the approved text; link it from the approval ticket's resolution comment, close that ticket, and append its named result pointer to the map. Reconcile remaining map fog with the approved boundaries and gaps. Until then, leave approval open and do not claim the map is complete.
