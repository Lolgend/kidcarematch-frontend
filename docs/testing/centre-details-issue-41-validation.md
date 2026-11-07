# Selected-weekday sampling validation (#41)

## Automated checks

- Focused commute API and session-controller tests: 40 passed after merging the independent direct-baseline slice.
- The controller tests cover sampling-only discovery; exact selected-policy request serialization and invalid opt-ins; strict response marker, cycle, selected-index, conditions, profile revision, and request-context checks; unequal results across two centres; shared Wednesday-to-Thursday advancement; reuse of the issued cycle/index by a subsequent centre session; authentication without calendar cycling; Wednesday-boundary expiry during an in-flight evaluation with one whole-cycle refresh; active Thursday-result refresh at cycle expiry; exhaustion without automatic restart; bounded second-expiry recovery; and stale selected-response rejection after a mode change.
- Focused V8 coverage run: 75.97% statements overall; `src/api.js` 70.49% statements / 68.42% branches; `src/commute/commuteSession.js` 78.22% statements / 83.73% branches.
- Full unit suite after merging the independent direct-baseline slice: 220 passed across 14 files.
- `npm run build`: passed. Vite emitted its existing large-chunk warning (1,025.05 kB minified).

## Synthetic browser checks

The temp-only `run-issue41.mjs` harness enabled the selected-sampling flag for a synthetic run, negotiated the sampling marker with a fabricated capabilities response, and served fabricated cycle/route fixtures. Puppeteer exercised direct arrival, reload, Back/Forward, then selected public transport. It ran Wednesday-to-Thursday success, Friday success, three-condition exhaustion, auth and service failures, one expired-cycle refresh, and a delayed selected response after changing mode.

Observed selected request sequences:

| Journey | Sampling indexes | Outcome |
| --- | --- | --- |
| Wednesday to Thursday | 0, 1 | Thursday synthetic route rendered |
| Friday success | 0, 1, 2 | Friday synthetic route rendered |
| Exhaustion | 0, 1, 2 | Unavailable state rendered |
| Authentication / service | 0 | Error state; no weekday advance |
| Expired cycle | 0, 0, 1 | One new primary cycle, then Thursday route |
| Late response | 0 | Mode change retained the driving route |

The two-centre controller fixture returned 20-minute and 30-minute via totals after one centre reported classified `no_itinerary`; both centres then used the same issued cycle and Thursday condition. It also confirmed the next centre reused that same cycle at index 1. The public page currently shows one centre at a time, so this multi-centre check runs at the pre-agreed controller seam.

Rendered text in every journey contained no weekday, sample date, or sample time; the final Wednesday-to-Thursday run also checked `aria-label` and `title` copy. Browser page errors: none. Off-origin requests, including basemap tiles, were intercepted and aborted (46–61 blocked requests per journey); no authentication service, backend, transit provider, or routing API was contacted. JSON reports and screenshots are under `C:\Users\ZPC\AppData\Local\Temp\kidcarematch-spec34\evidence` with `route-parent*` filenames.

## Release hold and limits

`VITE_COMMUTE_SELECTED_SAMPLING_ENABLED` defaults off. Setting the frontend flag is not capability certification and was done only inside the temporary synthetic browser process. No repository environment file, deployment, or backend was changed. The sibling backend remains unchanged and currently provides no evidence that this endpoint or policy is deployed.

The selected-sampling capability must remain disabled on a target until its backend build and marker are identified; exact discovery and response contracts, policy/date validation, cycle reuse and primary-Wednesday expiry, classified failure behavior, stale-response behavior, saved-profile ownership/privacy, and legacy request/cost compatibility are verified against that target. Backend-owned operational measurements are also absent: provider timeout, aggregate evaluation deadline, maximum concurrency, auth retry bound, cancellation behavior, rate limits, and load evidence. Frontend fixtures and unit tests do not establish provider timing, route quality, deployed support, or those operational budgets.

No matching score, rank, or fallback behavior was changed. No sample date/time is stored in persistent browser state or rendered by the selected-sampling UI path.
