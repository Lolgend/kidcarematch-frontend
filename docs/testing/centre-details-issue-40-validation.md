# Centre details #40 validation

Validated frontend support for the optional direct commute baseline. The implementation remains independent of selected-weekday sampling and continues to use the existing legacy Wednesday public-transport sample when sampling is unavailable.

## Release control and external gate

`VITE_COMMUTE_DIRECT_BASELINE_ENABLED` is a frontend release control and defaults to off. Even when explicitly enabled, the frontend opts in only after the authenticated capability response contains both required marker fields with nullable/string shapes and `direct_baseline_contract` is exactly `direct_baseline_v1`. The sampling marker is interpreted independently; an unknown sampling marker does not disable a valid direct baseline. The commute response must echo the direct marker and contain complete evaluation, condition, route and comparison metadata before the frontend shows the direct route or computes a difference.

This repository contains no deployed backend build/version, timing certification, privacy/access evidence or measured operational budgets for a target. No environment setting or deployment was changed. Keep the control off for real targets until the backend owner records the target evidence and numeric operational budgets required by [the accepted handover](../handovers/centre-details-commute-backend.md). Synthetic fixtures and frontend checks do not establish provider timing or deployed support.

## Automated checks

- `npm run test:coverage` passed: 14 test files, 209 tests. The configured coverage report covers API wrappers only (`src/api.js` and `src/admin/adminApi.js`): 100% statements and lines overall; `src/api.js` had 100% statements/lines and 97.4% branches. This does not measure UI or navigation coverage.
- `npm run build` passed. Vite reported its large JavaScript chunk warning (about 1,017 kB minified); the build completed.
- Focused API, commute-session and commute-view regressions cover exact capability/request opt-ins, default-off legacy serialization, unsupported and recoverable discovery failures, malformed response markers, stale-compatible controller operation, raw arithmetic, rounding and independent route availability.
- Display arithmetic cases include 2,491/1,829 seconds (11-minute difference despite independently rounded 42/30-minute totals), 2,520/1,800 (12 minutes), zero/negative, positive under 60 seconds, and an exact half-minute boundary (90 seconds rounds to 2 minutes). PT fixtures require elapsed timing, an initial wait, a common initial departure and onward departure equal to normalized first-leg arrival.

## Browser evidence

Used the provided temporary Puppeteer runner copied to `run-issue40.mjs`, with synthetic authentication, profile, centre, capability and commute responses. Off-origin traffic was blocked; no Firebase, backend or routing provider was contacted. The route fixture deliberately overlaps direct geometry with the two via-centre segments.

- Desktop: 1440×1000. The page displayed the deviation and all three route alternatives. A keyboard Enter on “Home to centre” set its button pressed and changed Leaflet path opacity to `1 / 0.18 / 0.18`; “Show all routes” restored its pressed state. Leaflet rendered the dashed neutral direct path and the two separate solid via paths without changing their overlapping geometry. No page errors; 59 off-origin requests were blocked.
- Mobile: 390×844. The same real Leaflet interaction worked, the map stayed 280px tall, and document width equaled the 390px viewport. No page errors. The fixed mobile map height gives Leaflet a measurable container during responsive layout and history navigation.

Screenshots and runner JSON reports are temporary artifacts under `%LOCALAPPDATA%\Temp\kidcarematch-spec34\evidence\` and are not committed.
