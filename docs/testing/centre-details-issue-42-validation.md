# Direct baseline and selected sampling validation (#42)

## Automated checks

- `npm run test:unit`: 237 passed across 14 files, including 44 commute-session, 31 commute-view, and 11 commute API tests.
- `npm run test:coverage`: 237 passed. The configured coverage scope is only `src/api.js` and `src/admin/adminApi.js`; V8 reported 100% statements, 98.47% branches, 100% functions, and 100% lines across those two API wrappers. These figures do not measure the view or session controller.
- `npm run build`: passed. Vite emitted its existing large-chunk warning (1,038.95 kB minified).
- The controller/API tests cover the four capability combinations, independent capability negotiation and combined request serialization, equal current sample context across centres, selected-condition expiry/recovery/exhaustion, direct and via `no_itinerary` classification, timing/location/service/auth failures, same-context service retry retention, same-condition component retention after partial 200 responses, refusal to calculate from mixed evaluations, clearing a prior Wednesday cohort on Thursday failure, endpoint auth clearing, and late/context-change rejection.
- Multi-centre and date-cycle behavior is verified at the public session-controller seam. The page renders one centre at a time.

## Synthetic browser checks

The temp-only `run-issue42.mjs` harness used fabricated same-origin API responses with release flags enabled in the test process. It rendered centre `3401` and recorded the requested values, visible comparison copy, route legend/accessibility text, current URL, persistence scan, errors, and blocked off-origin requests.

| Baseline | Sampling | Rendered outcome | URL / page errors |
| --- | --- | --- | --- |
| Off | Off | Comparison unavailable; via total 42 mins | `/centres/3401`; none |
| On | Off | 12 min extra travel; direct and via totals | `/centres/3401`; none |
| Off | On | Comparison unavailable; via total 42 mins | `/centres/3401`; none |
| On | On | 12 min extra travel; direct and via totals | `/centres/3401`; none |

The both-enabled flow was also checked at mobile viewport `390×844`. Browser assertions found route legend entries for the direct baseline, home-to-centre, centre-to-workplace, and show-all controls; the journey breakdown was accessible, the URL contained no query parameters, and no commute result was persisted. The UI exposed no weekday, sample date, or sample time. Direct-only legacy behavior and selected-only behavior remained distinct in the other two enabled combinations.

Two targeted browser journeys used both flags. A deliberately delayed response from centre `3401` was released after in-app navigation to centre `3402`; the late response did not replace the new centre's route. In the auth journey, a prior successful personal route was followed by endpoint HTTP 401; the page showed sign-in recovery while hiding the commute map, route totals, and stored route data. Page errors were absent in both journeys.

All browser API data was synthetic and same-origin. External origins (including map tiles and fonts) were intercepted and blocked; no live backend, identity provider, routing/transit service, or other off-origin API was called. Browser JSON reports and screenshots are in the local temp evidence directory `C:\Users\ZPC\AppData\Local\Temp\kidcarematch-spec34\evidence` (the five `route-parent-*` capability-combination reports and `route-parent-baseline-sampling-late-*` / `route-parent-baseline-sampling-auth-after-partial-*`).

## Release hold and limits

Both `VITE_COMMUTE_DIRECT_BASELINE_ENABLED` and `VITE_COMMUTE_SELECTED_SAMPLING_ENABLED` remain off by default. Browser flag overrides were confined to the synthetic runner. No environment file, backend, deployment, or live provider was changed. Synthetic fixtures and frontend tests do not certify deployed backend markers, provider route quality/timing, saved-profile ownership behavior, or operational limits such as timeouts, concurrency, cancellation, rate limits, and load. Keep each capability off for a target until its backend implementation, exact marker/contracts, privacy behavior, and operational evidence are independently verified.
