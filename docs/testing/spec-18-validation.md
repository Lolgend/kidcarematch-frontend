# Centre commute and required family profile validation

This change implements [specification #18](https://github.com/Lolgend/kidcarematch-frontend/issues/18) and tickets #19–#25. The frontend integration branch is `integration/spec-18`; the companion backend extends the existing `feature/matching-endpoint` branch.

## Automated checks

- Frontend: `npm run test:unit`, `npm run test:coverage`, and `npm run build`.
- Backend: `uv run pytest`, `uv run mypy src tests`, and `uv run ruff check .`.
- API-wrapper coverage remains configured for `src/api.js` and `src/admin/adminApi.js`. Its percentages do not measure the app UI, onboarding controller, or map components.
- Provider tests use deterministic fixtures and synthetic locations. Passing fixtures do not establish live OneMap availability or production credential validity.

The final frontend suite passes 191 tests. The companion backend suite passes 602 tests, with type and lint checks passing. The frontend production build succeeds with its existing large-bundle warning.

The standards review found no documented violations and one nonblocking maintainability observation about the existing concentration of UI composition in `src/main.jsx`. Both spec-review findings—profile-load recovery and route bounds—were corrected.

## Review corrections

| Before | Corrected behavior |
| --- | --- |
| A failed server profile read with a local draft could expose profile creation. | Loading must succeed before saving; a failed read offers retry and signout. |
| Concurrent saves or repeated authentication callbacks could restart setup. | Save submission and authentication callbacks respect the active session. |
| A previous route or profile form could survive a changed account or location. | Personal route results are invalidated and new setup starts with the current account's data. |
| A route request error removed the centre map. | Centre location loads independently and remains useful during route recovery. |
| A fixed map zoom clipped long commute routes. | The viewport fits available geometry and anchors, including after resizing. |
| Rapid map removal could leave a Leaflet zoom callback running against a removed map. | Programmatic fitting is nonanimated and viewport observers are stopped during cleanup. |
| Search omitted authentication; routing added an undocumented token prefix. | The display adapter follows the current REST authorization header contract. |
| Public-transport onward departure used requested departure plus itinerary duration. | The onward leg uses the provider's itinerary arrival timestamp; an unknown arrival leaves that leg unavailable. |
| Partial public-transport geometry could be joined across missing segments. | Missing segment geometry makes the route unavailable rather than drawing an invented connection. |

## Browser evidence

The local Vite app is checked at 1440 × 1000 and 390 × 844 using intercepted Firebase and API responses, synthetic family data, and no real authentication or backend writes. Only public OneMap basemap tile requests are allowed outside the local origin; route estimates and geometry are fixtures.

The browser pass covers guest centre details, signed-in mode/sample controls, route and marker visibility, modal resizing and overflow, text summaries, recovery states, profile-load retry, account changes, and preserved contact/review content. Browser evidence is separate from the Vitest suite. Screenshots and command output are local artifacts under `test-results/`.

Real email delivery, Google OAuth, production persistence, authenticated live OneMap routing, and a screen-reader session require an isolated configured environment and are not claimed by these checks. Existing matching and its fallback remain outside the new display contract.
