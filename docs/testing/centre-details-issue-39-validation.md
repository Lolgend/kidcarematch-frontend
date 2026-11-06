# Via-centre estimates and PT presentation validation (#39)

## Automated checks

- Focused commute, commute-session, commute API, and family-profile tests: 57 passed.
- `npm run build`: passed. Vite reports the existing bundle-size warning (1,007.82 kB minified).
- `git diff --check`: passed.

The tests cover the four travel modes, signed-session mode retention, immediate clearing on an actual mode change, late response rejection when cancellation is ignored, complete-total gating including expected leg order and usable geometry, missing-weekday PT unavailability, saved workplace configured/unresolved versus home-only copy, and legacy unequal weekday/weekend public-transport responses. API and family-profile request behavior remains on the existing saved-profile contract.

## Synthetic browser checks

An issue-specific copy of the spec-34 Puppeteer harness ran local Vite with synthetic auth and API fixtures, aborting off-origin browser requests. It exercised parent direct arrival, reload, Back, and Forward, then switched to public transport with unequal legacy weekday/weekend durations and geometry. Visible and accessible page text contained no sample day, date, or time; the displayed route and totals remained the weekday route. Home-only and configured-but-unresolved workplace fixtures showed distinct copy. The latter retained the usable home-to-centre leg and withheld complete totals. Desktop and phone captures measured a 510.75px and 280px map, with document width matching 1440px and 390px viewports. Browser page errors: none.

Screenshots and JSON reports are in the temporary harness directory `C:\Users\ZPC\AppData\Local\Temp\kidcarematch-spec34\evidence` (`route-parent-unequal-pt-*`, `route-parent-home-only-*`, and `route-parent-unresolved-workplace-*`). OneMap tiles were blocked by the harness, so the map geometry and fitting are fixture-backed while deployed basemap delivery remains unverified.

## Scope and limitations

The browser fixtures used synthetic saved profile locations and fabricated geometry; no live authentication, backend, or route provider was contacted. Legacy PT still requests its existing pair contract, while this page displays only its weekday sample. Direct route comparison and alternate-weekday recovery remain separate capability tickets and are not enabled here. Matching ranking/fallback behavior was not changed.
