# Centre details final validation and review (#34)

Implementation base: `1da9320`. Original reviews: `205e5e6`. Correction: `e131ef0`, merged as `09818f0` with an identical tree.

244 unit tests pass across 15 files. Configured API-wrapper coverage is 100% statements/functions/lines and 98.47% branches; it does not measure UI or controller coverage. The production build passes with the existing large-chunk advisory (1,043.48 kB minified JS). Generated dist output was restored.

Final Chrome captures covered 1440x1000, 768x1024 and 390x844, including both-enabled and default-off states and the reviews section. Document widths equal viewport widths; map heights were 510.75, 320 and 280px respectively. All five capture runs had no page errors. Separate final parent and guest checks clicked Skip map and focused exactly one complete summary target after exactly one map.

All five origin journeys passed refresh, contextual return and Back/Forward focus checks. Matching restored its controls/results without a fresh matching query and still responded to priority changes. Dirty-review multi-entry Back/Forward and beforeunload-handler checks passed. Correction fixtures also verified canonical guest membership, filtered-parent signout, postcode-query refresh without postcode storage, and direct-timeout retry while retaining the via estimate.

Browser fixtures used synthetic auth/API data and blocked all external requests, including fonts and basemap tiles. They do not certify live backend/provider behavior, real unload dialogs or production-host deep-link refresh. Both capability flags remain off by default; the accepted backend/operational release holds remain in force. Final screenshots and local harness reports are preserved in ignored `test-results/spec-34/`.

## Standards

### Original report

# Standards review — spec #34

Reviewed `git diff 1da9320...205e5e6` at `205e5e632af63c00a1ff9a5271111b83657150d6` against the repo instructions, domain docs, ADR-0001, and TDD test/mocking guidance. No unrelated redesign or tooling-enforced findings included.

#### Documented standard breach

- **P2 — Tests expose an implementation-only DOM seam.** `tests/commute/centre-commute.test.js:370,417` assert the private signed arithmetic through `data-deviation-seconds`; `src/commute/CentreCommute.jsx:401` adds that attribute. The TDD skill says tests should observe behavior through public interfaces and calls side-channel verification implementation-coupled. Keep the signed value internal and verify user-visible outcomes through the rendered contract, or establish a deliberate public seam if callers need this value.

#### Baseline smells — judgment calls

- **Possible Duplicated Code — route validation/auth classification.** `src/commute/commuteSession.js:29-39` and `src/commute/CentreCommute.jsx:67-70` repeat `isEndpointAuthorizationError`; the route-leg validators at `commuteSession.js:34-39` and `CentreCommute.jsx:34-51` also enforce the same available/source/duration/distance/geometry shape. Quote: `leg?.status === "available" ... Number.isFinite(leg.duration_seconds) ... Array.isArray(leg.geometry)`. One shared commute-contract helper could prevent the controller and view from accepting different response shapes. This is a heuristic; the controller's retained-route check and the view's stricter coordinate bounds may be intentional.
- **Possible Duplicated Code — return-context hydration.** `src/main.jsx:655-659`, `1212-1216`, and `3154-3158` repeat the query, district, level, page-offset, and comparison-selection assignments. Quote: `setQuery(origin.query || ''); setSelectedDistricts(...); setLevel(...); setPageOffset(...); setCompareSelectedIds(...)`. A shared restore helper would keep initial hydration, history traversal, and the return link aligned.

No other actionable documented-standard breaches found. ADR-0001's strict display/matching separation is respected by this diff's frontend display contract.

### Confirmation

# Standards confirmation — fix commit e131ef0

Bounded check against the three original findings in `standards-review.md`, using the designated fix worktree and `centre-details-review-resolution.md`.

- **Resolved — DOM side channel:** `data-deviation-seconds` is absent from the component. Tests now assert visible commute copy for positive/negative outcomes and omit the private arithmetic check.
- **Resolved — duplicated commute predicates:** both `CentreCommute.jsx` and `commuteSession.js` import shared authorization and route-leg validators from `src/commute/commuteContract.js`. The shared geometry predicate enforces WGS84 latitude/longitude bounds in both paths.
- **Resolved — repeated origin hydration:** `restoreCentreOriginState` owns the query/filter/page/selection and matching-snapshot restoration and is called for initial hydration, history restoration, and the return link.

No remaining findings among the three reviewed. This was a bounded source/diff check; no tests were rerun.

## Spec

### Original report

# Spec review — issue #34 (pinned HEAD 205e5e6)

- **High — guest access can bypass the six-centre preview boundary.** The accepted spec says, “Preserve the six-centre guest preview boundary on both entry-point and direct-link navigation” (`docs/specs/centre-details-page-and-commute-deviation.md:65`). `openCentreDetails` blocks incomplete signed-in users but never checks guest eligibility (`src/main.jsx:1175-1182`); it loads the clicked listing object before the backend response. The direct-link check separately treats the first six items of the current filtered/paginated `centres` result as the preview (`src/main.jsx:1225-1226`). Thus a guest can open a non-preview directory result, and filter/query state can redefine which six IDs qualify.

- **Medium — malformed unavailable-leg payload can crash commute rendering.** The handover requires “a contradictory or malformed response [to] fail[] closed for comparison” (`docs/handovers/centre-details-commute-backend.md:169`), while its accepted reason table classifies malformed provider payloads conservatively (`:215`). `CentreCommuteView` calls `l.message.toLowerCase()` whenever `message` is merely truthy (`src/commute/CentreCommute.jsx:237-249`); a numeric/object message throws during render and can take down the commute/page instead of preserving centre/review sections and withholding the comparison.

- **Medium — PT certified elapsed durations are not reconciled with timestamps.** The accepted handover says PT comparison must use “elapsed travel from requested departure to arrival with initial waiting” and gives the 08:00→08:15 example where elapsed duration is 15 minutes despite a 10-minute itinerary (`docs/handovers/centre-details-commute-backend.md:175-177`). `isCertifiedComparison` checks initial departure equality and that onward departure equals first-leg arrival, but never verifies `duration_seconds` against each leg’s departure/arrival elapsed time (`src/commute/CentreCommute.jsx:130-137`). A response marked `elapsed_from_requested_departure` can therefore pass certification with contradictory duration/timestamp data and produce a false extra-travel headline; it should fail closed per handover line 169.

### Confirmation

# Spec finding confirmation — e131ef0

- **Guest preview boundary — Resolved (frontend).** `guestPreviewIds` loads an unfiltered canonical `getCentres({ limit: 6, offset: 0 })` result. Entry clicks and direct URL/history restoration require `guestPreviewStatus === "ready"` and canonical membership; pending/error checks stop navigation, and nonmembers receive the sign-in view. Filtered/paginated `centres` no longer define eligibility. The accepted backend-authoritative authorization release hold remains external and is not established by this change.
- **Malformed commute payload — Resolved.** Non-string `message` values are ignored for location copy. Samples, legs, route legs/reasons, and transit collections are guarded/filtered before use. Invalid content cannot supply totals or certification; valid route geometry and unrelated page sections remain renderable.
- **PT elapsed duration/timestamp contradiction — Resolved.** PT certification and complete-total eligibility now validate each leg's provided departure/arrival timestamps and require their interval to equal `duration_seconds`. The 08:00–08:15 vs 600-second regression withholds the headline/totals while retaining the map geometry. Missing optional timestamps remain allowed per the recorded resolution; contradictory present timestamps fail closed.

No remaining findings from the original three Spec findings.

Coordinator follow-ups (query privacy/restoration, contradictory supporting totals, supported direct-timeout retry, and the #42 evidence table) are recorded separately in [the resolution record](centre-details-review-resolution.md).

## Visual confirmation

The generic reviewer followed the Impeccable degraded finish-reviewer contract because this harness has no shipped-role selector. The accepted spec and existing design system supplied the authority for this extension; PRODUCT.md, DESIGN.md and concept-comparison artifacts were absent. The detector's two warnings concern an existing notification accent and a functional route-legend line; neither warrants removal.

## verdict

- Fix 1 — resolved. The desktop, mobile and default captures show the map before mode controls and commute copy. The resolution record confirms the map-first order also covers loading and error states.
- Fix 2 — resolved. The 768px tablet capture shows map and contact/facts columns side by side; the responsive breakpoint now stacks below 768px.
- Fix 3 — resolved. The map is followed by the single focusable commute summary containing controls and readable journey details. The Skip map handler focuses that region. Root Chrome verification confirmed exactly one target focused for both a parent and guest flow, with no page errors.

## remaining

Clear. This ship applies to these three scored fixes only, not a full-surface reapproval.

disposition: ship

Standards: 3 original findings (worst P2), all resolved. Spec: 3 original findings (worst High), all resolved. Visual: 3 requested fixes, all resolved.
