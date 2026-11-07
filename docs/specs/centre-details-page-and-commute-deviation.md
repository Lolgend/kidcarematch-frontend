# Full centre details page and commute deviation

Status: **Accepted on 2026-11-07.** Prepared for [Approve the centre details specification and backend developer handover](https://github.com/Lolgend/kidcarematch-frontend/issues/33). The user explicitly accepted both complete artifacts after accepting all four synthesis proposals. No implementation, PR or deployment is authorized by this document.

## Outcome and sources

Families can open a shareable centre page, inspect a substantially larger map, and understand the extra travel through a centre when comparable direct and via-centre routes are available. Returning recovers the previous browsing context. Personal journeys remain private to the current viewer.

This specification and the linked [backend developer handover](../handovers/centre-details-commute-backend.md) are the two accepted planning artifacts. The handover defines the agreed target wire contracts, backend responsibilities and release evidence. Agreed target contracts are not claims of existing backend support.

On 2026-11-07 the user answered **“Yes to all”** to the four synthesis proposals: `/centres/:centreId` and upward rounding at exact half minutes; the opt-in API schema with independently detected baseline/sampling capabilities and legacy compatibility; expiry of the entire selected-sample cycle at its primary Wednesday 08:00 SGT boundary; and backend-developer ownership of measured operational budgets with capability release held until documented. The user then answered **“Yes”** to explicit acceptance of both final planning artifacts and resolution of the approval ticket. No planning questions remain open in this package.

Decision sources, which remain the canonical records of their resolutions:

- [Plan full-page centre details and commute deviation](https://github.com/Lolgend/kidcarematch-frontend/issues/27).
- [Choose the full centre page layout and navigation behavior](https://github.com/Lolgend/kidcarematch-frontend/issues/30#issuecomment-6687388992).
- [Choose one-route or weekday/weekend public-transport presentation](https://github.com/Lolgend/kidcarematch-frontend/issues/31#issuecomment-6687817664).
- [Choose commute deviation presentation and backend handover boundaries](https://github.com/Lolgend/kidcarematch-frontend/issues/32#issuecomment-6689170502).
- [Display-contract research](https://github.com/Lolgend/kidcarematch-frontend/blob/8c92703657dbb48f12e5da78cd6df434145663bd/docs/research/centre-details-deviation-contract.md) and [public-transport investigation](https://github.com/Lolgend/kidcarematch-frontend/blob/a2f643eedb225e7cafc027f371e76588db5e235a/docs/research/centre-details-public-transport-samples.md). Their historical open questions/proposals are superseded only where the later decisions above settle them.

Use the [repo glossary](../../GLOSSARY.md). Commute deviation remains a signed difference in travel time; the headline's treatment of negative values is presentation only. Distance remains supporting route information, not another deviation metric.

## Relationship to the earlier specification and ADRs

This is a scoped successor to [Centre commute and required family profile](centre-commute-and-required-family-profile.md), rather than a replacement for its onboarding requirements. Apply this precedence table wherever the older documents disagree:

| Earlier requirement | Replacement here | Preserved boundary |
| --- | --- | --- |
| Inline details modal; no dedicated page; modal close and Escape dismissal; mobile content fits the modal | Full centre page, contextual return and normal browser history; Escape does not dismiss it | Existing visual system, centre facts, contact and review rules |
| Weekday/weekend controls, visible dates and 08:00 assumptions, route switching by day; earlier stories 17, 18 and 20 | One selected public-transport route; no displayed sample day/date/time, including tooltips and accessibility copy | Internal sample identity, consistent conditions, explicit unavailable states |
| Single-route simplification conditional on typical equality | Deliberate single-route presentation regardless of whether weekend itineraries differ | No claim of equality, live estimates or all-week averages |
| Details show only via-centre routes | Add an opt-in direct display baseline and a certified comparison, capability gated | Existing legs/totals remain via-centre; matching fields are not a display baseline |
| Successful profile setup always continues to matching | Resume a pending permitted centre destination after sign-in/setup; otherwise retain the established destination | Persisted profile completion, ownership, account roles and existing access limits |
| ADR-0001 describes representative weekday/weekend samples | Its presentation premise is reopened by the accepted single-route decision; this successor records that exception explicitly | ADR-0001's display/matching separation remains accepted |

The backend developer must similarly reconcile backend ADR-0009's sample presentation when implementing the new opt-in policy, preserving backend ADR-0007 matching behavior. This planning effort does not edit the read-only backend or rewrite historical ADRs as if they never existed.

## Page structure and navigation

Keep the established interface styling. This is an Operate surface: families need to inspect a centre and compare their journey without learning another navigation model.

Desktop reading order:

```text
Contextual return link
Centre name · address · rating

Large map                         Contact details
Travel-mode controls and summary  Centre facts
Route legend and textual journey breakdown

Published reviews and review editor
```

Cap content width at 1280px. Use a wider map column and narrower contact/facts column. The map grows in width and height near 16:9, reaching approximately 936 × 527px on wide screens rather than remaining at the current 240px height. These dimensions express the approved composition, not fixed widths that overflow smaller screens.

Below tablet width stack: return, heading/address/rating, map, commute information, contact/facts, reviews/editor. The mobile map is at least 280px tall even when that departs from 16:9. Preserve usable controls and a readable text breakdown; do not require map interaction to understand travel.

Phone, email and website actions stay with contact details; omit missing fields. Save and compare stay in their established application locations. Preserve existing review eligibility, published-review visibility and editing of the parent's existing review.

### Identity and access

- Use the existing centre ID as URL identity. **Accepted path:** `/centres/:centreId`; names are display content, not identity. Resolve direct arrivals and refresh by ID without a prior listing. Hosting must support this route on refresh.
- All current entry points navigate to that page: six-centre overview preview, directory, matching results, watchlist and comparison.
- Preserve the six-centre guest preview boundary on both entry-point and direct-link navigation. Other centre details require sign-in. Guests permitted to read a centre can read published reviews, see its centre-location map and see a sign-in prompt for personal routes.
- Preserve required saved-profile setup for authenticated parents, including existing role exceptions. Remember a pending centre through sign-in and setup, then resume it after rechecking access. A failed profile load/save must not unlock the page or lose the pending destination.
- Canonical ID stability and authoritative guest-eligibility enforcement are readiness checks in the handover; they are not established by the existing client alone.

### Return and history

The page return link points to the originating screen and restores its results, filters, pagination, comparison selections and scroll. Browser Back/Forward keep normal semantics. Opening several centres must retain the original return context without trapping the user in replacement history entries.

Preserve origin context through refresh in the same tab for that tab's session. A shared URL in a different tab starts without origin context. Without an origin, show **Browse centres**, subject to the directory sign-in gate. Bind personal restoration state to the authenticated account; clear it on sign-out/account change and reauthorize when restoring.

The centre URL contains centre identity only: no profile identifier, home/workplace, route geometry, sample state or personal search data. Durable tab-session restoration must not serialize personal route responses. Keep routes ephemeral; persist the minimum origin state needed for the accepted restoration behavior. A copied/new tab must not inherit an origin merely because browser storage was copied; implementation must cover that lifecycle in acceptance checks.

### Sections and interaction

Load centre information, reviews, own review and commute information independently. Unknown ID shows **Centre not found**. Temporary centre-detail failure shows retry, rather than pretending the ID is absent. Review and commute failures are inline and leave available centre information usable. Retain the address when the location/map is unavailable.

On entry focus the page heading; on return focus the originating centre control if it still exists. Provide keyboard-operable map controls and a skip-map action. Escape does not close the page. Confirm discarding an edited, unsaved review before leaving through application navigation; use browser-supported protection for document departure. A successful submission leaves the reader at the review section.

## Travel estimates and sampling

Offer driving, public transport, walking and cycling. Initially select driving; retain the chosen mode during the signed-in browsing session. Apply one mode to the whole journey. Use the currently loaded saved family profile; do not add a profile selector or change the multiple-profile ownership model. Include workplace routing whenever that profile supplies a workplace, independently of its matching location preference.

Use **Estimated travel time** and **Actual journeys may vary**. Show travel-only duration and supporting distance for usable journey legs and complete totals. Explain that drop-off time is excluded. Do not describe results as live, an all-week average, or proof of weekday/weekend equality.

### Public transport

- Show exactly one selected route, even if the provider's weekend route differs. Remove weekday/weekend controls throughout the centre-details experience.
- Internally use the next upcoming Wednesday 08:00 Asia/Singapore as primary. At or after that Wednesday's 08:00 boundary, use the next week's primary.
- For sample-dependent failures try that Wednesday, then its immediately following Thursday, then Friday, all at 08:00 SGT. Try each at most once per sampling attempt; no weekend substitution and no unbounded date loop.
- Authentication errors and confirmed service outages do not advance the date. Use the relevant sign-in/error/retry state. Exhaustion shows unavailable and retry. A user retry begins a new bounded attempt, not an automatic infinite restart.
- Keep dates/times internally for validation and diagnosis. Expose no sample day/date/time in visible labels, titles, tooltips, accessibility text or other interface copy. This does not forbid showing a travel duration.
- Within the relevant comparison set, use the same initial public-transport condition across centres and direct/via alternatives. Start onward centre → workplace at first-leg arrival, without drop-off dwell.
- Advancing the sample invalidates every affected centre estimate and both route alternatives in that set. Reject late responses from the prior sample. Only publish a numeric comparison from the active, compatible set; independent components may finish earlier without claiming the comparison is ready.
- The handover defines the accepted target cycle identity and expiry rules. These are not existing backend support. Expiry refreshes the whole set; it cannot restart a hidden unbounded loop.

Driving, walking and cycling retain provider-default estimates. They are not Wednesday traffic forecasts and do not acquire calendar retries simply because public transport does.

### Stale responses and personal state

Bind every active response to account, saved-profile/location revision, centre, mode, sampling identity and request generation. On any such context change remove the previous active personal geometry and metrics immediately and show loading. Cancellation is useful but is not sufficient: reject stale completions even if they cannot be cancelled. Clear private state on sign-out/account change; revisiting browser history must not resurrect another viewer's journeys.

For a same-context retry, usable components may stay visible. A new sample or changed profile/centre/mode is a new context, so that exception does not retain old metrics under new controls.

## Commute deviation and route presentation

For a configured workplace, enable the metric only with explicit direct-baseline support, complete required route inputs and backend-certified compatible duration semantics. Compute from raw unrounded seconds:

```text
signed difference = via-centre total duration − direct home-to-workplace duration
```

Do not use matching's rounded/clamped baseline or deviation. Do not infer comparability from geometry or matching initial timestamps alone.

| Raw signed difference | Headline |
| --- | --- |
| Zero or negative | No extra travel |
| Positive, below 60 seconds | Less than 1 min extra travel |
| At least 60 seconds | Nearest whole minute, e.g. 12 min extra travel |

Preserve the signed difference internally, including a negative result. Round supporting travel times separately and explain **Times rounded**, since displayed totals may not subtract exactly. For example, via 2,491 seconds and direct 1,829 seconds display 42 and 30 minutes, while the 662-second difference displays 11 minutes. Accepted exact-half convention for implementation: half a minute rounds upward for nonnegative durations/differences.

With eligible via 42 minutes and direct 30 minutes, lead with **12 min extra travel**. Below show **Via centre 42 min · Direct 30 min**, then each via-centre journey-leg time and distance. Preserve supporting route distances without adding a distance-deviation headline.

Draw both usable alternatives together: dashed neutral direct route, solid via-centre route with distinct leg colours, directional arrows and a labelled legend. Label Home, Centre and Workplace markers. Identify the direct route and both via-centre legs through text, line treatment and interaction as well as colour.

On overlapping paths keep real geometry, using layered strokes/dashes rather than moving routes away from their coordinates. Keyboard-operable legend controls highlight one route/leg and dim others, plus **Show all routes**. Text summaries remain usable independently of the map.

## Availability and partial failures

| Context or failure | Required presentation |
| --- | --- |
| Permitted guest | Centre-location map and sign-in prompt; no personal routing request |
| Home, no configured workplace | Home → centre time/distance; direct baseline/deviation not applicable |
| Configured workplace cannot resolve | Explicit location error/Edit family profile; do not silently become home-only |
| Direct fails, via complete | Keep via geometry, legs and total; Extra travel unavailable, explain direct failure and offer retry |
| Via leg fails, direct complete | Keep direct and independently usable via leg; no incomplete via total; Extra travel unavailable |
| Home cannot resolve | Retain centre information/map, location error and Edit family profile; no invented routes |
| Known centre location cannot resolve | Keep centre address/error; retain independently usable direct baseline if supported |
| Routes usable, timing/conditions not certified | Keep independently usable routes; Extra travel unavailable; never No extra travel |
| Backend baseline capability absent | Extra travel comparison isn’t available yet; no direct overlay or deviation; retain supported via information |
| Capable backend, comparison transiently fails | Extra travel unavailable with brief reason/retry; distinguish from unsupported capability |
| All selected public-transport samples fail | Explicit unavailable/retry; retain unrelated usable centre/review information |

Use stable reason codes for behavior and plain user-facing explanations. An unavailable comparison is never zero, and a partial journey is never a complete total. Keep authentication, ownership/access denial, endpoint failure and component/provider unavailability distinct.

## Staged delivery and responsibility

| Stage/capability | Can ship | Gate |
| --- | --- | --- |
| Full page and larger map | Navigation/restoration, independent sections, existing modes and supported estimates, one selected Wednesday public-transport route without timing labels | Page/access/history acceptance passes. Existing API pair may still be fetched; only Wednesday is shown. No claim of Thursday/Friday retries |
| Direct baseline and comparison | Both route alternatives and eligible deviation; independent successes even when comparison fails | Explicit direct-baseline contract, timing certification, privacy and failure fixtures pass |
| Bounded weekday policy | Wednesday → Thursday → Friday fallback and coordinated comparison refresh | Separate explicit sampling-policy support, identity/expiry/failure-classification checks pass |

The last two capabilities can be released independently. If sampling policy exists before baseline, retain via-only estimates with bounded fallback. If baseline exists first, comparisons may use the supported Wednesday route, but alternate-weekday retries remain unavailable. Each gate is verified on the deployed target, not inferred from a successful HTTP response or a code branch.

Frontend owns page/history, section state, presentation/rounding, map accessibility, private ephemeral route state and coordinated comparison-set invalidation. Backend owns authorized anchor resolution, real geometry, provider normalization, timing evidence, capability markers, comparison certification, selected-sample validation and classified independent failures. See the handover for the agreed target boundary and required readiness evidence.

## Acceptance scenarios

These are requirements for implementation verification, not checks run in this planning session.

| ID | Scenario | Pass condition |
| --- | --- | --- |
| P1 | Open details from overview, directory, matches, watchlist and comparison | Same ID-based full page; no surviving popup-only entry point |
| P2 | Open a URL directly, refresh it, and rename the centre | Same centre identity resolves without a prior listing; hosting serves the route |
| P3 | Return to each origin after several centre visits and Back/Forward | Results, filters, pagination, comparison selections and scroll restored; normal history; origin-control focus restored when present |
| P4 | Refresh within a tab; open shared link in another tab; sign out/account switch | Same-tab origin survives; new tab has no borrowed origin; personal restoration/routes cleared on identity change |
| P5 | Wide desktop and narrow/mobile viewport | Approved two-column/stacked order, growing near-16:9 desktop map, at least 280px mobile map, no clipped controls/text |
| P6 | Preview guest versus out-of-preview direct link; parent needing setup | Existing access limits enforced; guests see only permitted details/location/reviews; sign-in/setup resumes permitted requested centre |
| P7 | Unknown ID versus temporary details/reviews/commute failure | Correct not-found versus retry; failures do not erase unrelated usable sections |
| P8 | Missing contact fields; existing review; dirty editor; keyboard-only use | Omitted missing fields; current review rules; discard confirmation; heading focus/map skip/legend controls; Escape leaves page open; submit stays at reviews |
| T1 | Different weekday/weekend provider results | Only selected weekday route; no sample day/date/time in visual or accessibility copy; no equality claim |
| T2 | Sample-dependent Wednesday failure, Thursday succeeds | Whole relevant set changes to Thursday; no stale Wednesday metrics presented as comparable |
| T3 | Wednesday/Thursday fail, Friday succeeds; separately all three fail | At most three dated samples, no weekend; exhausted attempt shows unavailable/retry |
| T4 | User authentication fails or service outage is confirmed | No date cycling; appropriate sign-in/retry; independent successes retained |
| T5 | Cycle expiry, profile/location/mode/centre change, late older response | Old active personal output cleared; coherent refresh; stale response cannot restore it |
| T6 | Driving/walking/cycling | Provider-default semantics, no sampled-traffic claim; mode defaults and session retention preserved |
| D1 | Complete eligible via 2,520 s, direct 1,800 s | 12 min extra travel, supporting totals/legs, simultaneous distinguishable routes |
| D2 | Equal totals; via 1,680 s/direct 1,800 s; positive 1–59 s | No extra travel for first two (signed −120 retained); Less than 1 min extra travel for last |
| D3 | Via 2,491 s/direct 1,829 s; exact-half rounding boundary | 42/30 supporting minutes, 11-minute difference from raw seconds, Times rounded; accepted half convention applied consistently |
| D4 | Direct fails; separately one via leg fails | Independent successful geometry/times retained; unavailable metric; partial via has no complete total |
| D5 | Geometry/departure match but elapsed timing evidence absent | Comparison withheld; synthetic arrival alone cannot certify initial waiting semantics |
| D6 | Overlapping routes, colour-blind view, keyboard legend selection | Real paths remain in place; labels/strokes/arrows/highlighting distinguish each leg; text usable without map |
| D7 | No workplace versus configured unresolved workplace | Home-only is not applicable; unresolved required workplace is unavailable; no invented zero |
| C1 | Legacy server ignores unknown opt-in fields | Missing/invalid support markers detected; no direct overlay/deviation or claimed weekday fallback |
| C2 | Each capability released separately or neither present | Stage table honored; useful supported estimates remain, unavailable copy truthful |
| S1 | Another parent's profile, shared centre link, browser history after account change | No unauthorized anchors, geometry, identifiers or private results disclosed |
| S2 | Same fixture inputs to matching before/after display changes; routing provider failure | Matching scores/ranking/fallback unchanged; strict display never draws matching's straight-line fallback |

## Evidence limits and acceptance

Current source and existing fixtures establish implementation shape, not live OneMap quality, typical weekday/weekend equality, timing accuracy or deployed capabilities. No new tests, provider calls, credential checks or production probes were performed for this draft. Historical passing tests do not certify this planned feature. Source-confirmed gaps and exact readiness checks are in the handover.

The URL path, exact API names/shapes, selected-policy expiry, half-minute convention and operational-budget ownership/release hold were explicitly accepted in the four-proposal HITL round, followed by explicit acceptance of the complete artifact package. Numeric backend operational budgets require measured provider/deployment evidence, with the backend developer responsible for recording it before capability release. Acceptance of this planning package does not assert that backend capabilities or that evidence already exist.

Out of scope: application/backend implementation in wayfinder, PR/deployment, matching/ranking changes, new guest access, profile ownership/model changes, broad onboarding redesign, turn-by-turn navigation, departure-time/drop-off controls and unrelated visual redesign.
