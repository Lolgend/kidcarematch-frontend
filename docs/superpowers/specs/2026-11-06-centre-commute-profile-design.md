# Centre commute comparison and required family profiles

Status: accepted. The user confirmed shared understanding, including the sample conditions, on 2026-11-06. This document records the agreed design; product implementation has not started.

## Intent and outcome

Help parents assess the travel implications of a childcare centre directly in its existing details modal. Show a OneMap route from home to centre, continuing to workplace when the loaded family profile provides one, with estimated travel time and distance. Require new and returning parents to complete their family profile before continuing into the signed-in parent app.

This is a centre-comparison feature. Turn-by-turn navigation, user-facing date/time controls, drop-off scheduling, mixed travel modes between journey legs, matching-score changes, and a new centre-details page are outside scope.

The confirmed requirements and interview context are recorded in [the decision notes](../../design/2026-11-06-centre-commute-profile-notes.md). Domain terms are defined in [the glossary](../../../GLOSSARY.md).

## Approaches

The user chose an inline commute section in the current centre-details modal. It puts the map below the address, keeping journey information visible without another navigation step. The considered alternative was a separate Commute tab in the same modal, which reduces scrolling but hides the information until selected.

Keep the incumbent visual system, modal behaviour, contact information, centre attributes, and reviews. A standalone centre page would expand the change unnecessarily.

## Commute experience

1. Opening centre details shows the centre location and an inline commute section below its address. Map work starts when details open, rather than for every directory card.
2. Signed-in parents with a completed, loaded family profile see home-to-centre routing. If that profile contains a workplace, also show centre-to-workplace routing regardless of its matching location preference.
3. Offer Driving, Public transport, Walking, and Cycling. Driving is initially selected. One selected mode applies to both journey legs; a public-transport itinerary may itself include walking and transfers.
4. Keep the mode selection while opening other centres during the signed-in browsing session. Reset user-specific route state on signout or account change. Cross-device preference persistence is outside scope.
5. Show home-to-centre and centre-to-workplace durations and distances separately, with a combined travel-only total when both requested legs succeed. Without workplace, show the single leg without an empty second leg. Exclude any time spent at the centre.
6. Where date-dependent results are verified, show representative weekday and weekend summaries. Selecting a summary switches the displayed route, using the same travel mode. Initially select Weekday. Stack summaries on narrow screens.
7. Where day-dependent variation cannot be verified, show one estimate with its actual assumptions. Do not manufacture differing weekday/weekend values or describe a representative sample as an average.
8. Label markers Home, Centre, and Workplace. Distinguish journey legs with labels and line styling as well as colour. Fit the map to the available route; retain a readable text breakdown independent of map interaction.

Guests keep their existing access to centre details. They see a centre-location map and a sign-in prompt for a personalised commute. Do not request or retain guest home/workplace locations for this change.

## Sampling

Use 08:00 Singapore time on the next upcoming Wednesday for the weekday sample and the next upcoming Saturday for the weekend sample. Display the actual sample dates and time with the estimates. These are illustrative sample conditions, not all-day averages, holiday-adjusted estimates, or promises about traffic.

Choose one sample pair for the current comparison session and reuse it across centres. An expired sample must be refreshed consistently for the session, rather than leaving centres compared under different conditions.

For public transport, request the onward leg at the estimated arrival time of the first leg, with no drop-off duration added. Sum both leg durations. If the first leg is unavailable, do not invent an onward departure time: the onward leg may remain unavailable for that sample. Retain any already available leg under the partial-failure rules.

The exact REST public-transport date/time and geometry contract must be verified before building against it. If the provider cannot support the required representative estimates, bring that concrete constraint back for a product decision; do not silently drop a promised mode or invent data.

## Route states and failures

- Loading a route must not prevent reading other centre details. Changing mode or sample must cancel or disregard stale results.
- A failed leg shows an inline unavailable state and retry. Retain successful geometry and leg estimates, identify the missing leg, and omit the complete-journey total. Never sum missing legs as zero.
- If neither leg succeeds, keep the centre-location map when coordinates are available. If the centre itself cannot be resolved, show the address and an unavailable-map message.
- A correctly formatted but unresolvable home or workplace postcode produces a clear location message and an Edit family profile action. Geocoding failure does not make a successfully saved family profile incomplete.
- An unavailable OneMap service, expired token, missing credentials, missing geometry, or unusable itinerary must not masquerade as a successfully routed journey. Do not use the existing matching adapter's straight-line fallback in this display contract.
- Changing profile locations invalidates the old route. User-specific caches and pending requests must not leak results across accounts or profiles.

## Required family-profile flow

Distinguish authentication pending, email verification pending, profile loading, profile required, save pending, load/save error, and ready. A parent must not see ready-state navigation while profile eligibility is still being resolved.

Email/password registration continues to send verification and sign out. After verification and sign-in, load the family profile and require completion when necessary. The transient authenticated session created during registration must not expose the signed-in parent app. Google signups enter profile checking after successful authentication. Apply the same verified-session policy on initial page load and authentication callbacks, not just the password form.

Completion requires a successfully persisted family profile with a six-digit home postcode, child level, citizenship, care type, enrolment month, and positive budget. Validate workplace if provided and require it for WORKPLACE/EITHER matching preferences. Existing defaults may count. Household income remains optional to the parent; retain compatible backend defaults and validation for household values and weights.

Technical default: reuse the frontend's currently loaded family profile and its backend identity. Preserve the backend's multiple-profile portfolio and ownership rules. No new profile selector, database completion flag, or singleton constraint is part of this feature. When there is no profile, create one through the existing profile endpoint; when one is loaded, update that profile.

Technical default: remote persistence is required to leave mandatory setup. A local draft can preserve inputs but cannot satisfy completion. On load failure, show retry without treating an unknown server state as an absent profile; do not create duplicate records. On save failure, keep entered values and explain that saving must be retried. Once successfully saved, re-evaluate the same completion rules and enter the existing Find my matches destination.

While setup is required, parent navigation and previously opened centre/review overlays must not bypass it. Keep signout available so the user can return to the existing guest experience. Do not require administrators to create parent profiles: backend profile endpoints reject the administrator role, and the gate belongs to the parent application.

The scope is mandatory onboarding in the signed-in parent app, plus ownership and valid-profile checks for the new personalised commute endpoint. Do not apply a new global profile requirement to existing anonymous matching, reviews, or administrative API contracts.

## Integration and existing architectural decisions

Use the installed Leaflet/React Leaflet libraries with OneMap basemaps. The existing FastAPI backend is the integration point for authenticated OneMap search/routing; credentials stay server-side. Reuse its geocoding client and cache where appropriate, verifying that returned postal codes match requested postal codes exactly.

Add a dedicated centre-commute contract under the existing centres API. For signed-in requests, send the loaded profile identifier, selected mode, and representative scenario selection. The server derives home/workplace from the owned profile and selects the sample conditions; it does not trust client-supplied ownership. Provide coordinates, per-leg route geometry, explicit success/unavailable status and source, durations/distances with unambiguous units, sample metadata, and totals only when complete. Public centre-location data may be exposed separately without profile locations.

Keep token handling and response normalisation inside the server adapter. Resolve upstream authentication/renewal and expiry behaviour during integration; report route unavailability explicitly when credentials cannot be used. Cache keys must include relevant coordinates, mode, and sample date/time. Route cache lifetime, request limits, token renewal mechanism, and geometry encoding/decoding are builder choices subject to provider contracts.

The backend's ADR-0003 separates Firebase identity/application User creation from family preferences; retain that lifecycle. ADR-0006 requires multiple named, owned family preference profiles; retain it. ADR-0007 specifies public-transport routing and straight-line fallback for matching. Selectable modes and explicit failures apply to the new display contract, leaving that matching policy unchanged. Replacing the shared matching return values or removing its fallback globally would contradict ADR-0007 and is outside this design.

The current frontend calculates local travel scores differently from the backend. Neither ranking path changes here. The displayed commute estimate must not be presented as the source of the current match score.

This separation is captured in [ADR-0001](../../adr/0001-separate-commute-display-from-matching.md).

Implementation requires coordinated changes in the frontend and sibling backend repository. This design does not include deployment or credential provisioning.

## Validation and builder discretion

Meaningful checks should cover route geometry/units for all modes; sample metadata and sequential public-transport legs; exact postcode matching; partial/unavailable routes and omitted totals; profile ownership; and preservation of matching fallback behaviour. Frontend checks should cover verified-signup/Google/returning-user gates, stale-route suppression, account/profile changes, guest centre maps, successful server-save gating, and recovery from load/save failure. Verify the modal and readable breakdown on desktop and mobile, including keyboard access and map scroll behaviour.

Use provider fixtures or mocks for deterministic checks; avoid live OneMap calls in routine tests. Run each repository's existing required checks when implementation occurs. No product tests are needed for this documentation-only interview.

The builder may choose component seams, request cancellation mechanics, geometry transport format, visual spacing within the incumbent style, accessible control details, and cache/configuration implementation. Those choices must preserve the described behaviour.

## External references

- [OneMap REST routing](https://www.onemap.gov.sg/apidocs/routing): start/end routing and mode enumeration; retrieved documentation does not establish a weekday/weekend-average API or the full REST public-transport timing/geometry contract.
- [OneMap authentication](https://www.onemap.gov.sg/apidocs/authentication): authenticated services and token lifetime; map services are exempt from that token requirement.
- [OneMap search](https://www.onemap.gov.sg/apidocs/search): relevance-ranked postal/address search, requiring exact-postcode checking by the application.
- [Official OneMap MCP documentation](https://www.onemap.gov.sg/apidocs/mcp): public-transport date/time inputs; MCP details must not be assumed to define the REST contract.
