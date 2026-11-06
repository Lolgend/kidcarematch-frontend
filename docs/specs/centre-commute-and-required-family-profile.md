## Problem Statement

Parents evaluating childcare centres cannot see how a centre fits into the journey from home, or from home through the centre to their workplace. Centre details contain location and contact information but no map or personalised commute comparison. Existing match scores do not provide this visual explanation and must retain their current behaviour in this change.

Parents can also register or return to the signed-in app without completing their family profile. The current post-login prompt can be dismissed by navigating elsewhere, and a profile saved only on the device can be treated as complete even when server persistence fails. Personalised features therefore cannot consistently rely on a valid, saved family profile.

## Solution

Add an inline OneMap commute comparison below the address in the existing centre-details modal. Show home to centre, continuing to workplace whenever the loaded family profile includes one. Offer driving, public transport, walking and cycling, with clearly labelled route geometry, per-leg travel time and distance, and complete-journey totals when all requested legs are available.

Provide representative weekday/weekend comparisons using 08:00 Singapore time on the next upcoming Wednesday and Saturday. Label the sample conditions. Use a single estimate for modes where day-dependent variation cannot be verified. This helps parents compare centres without introducing trip-planning controls.

Make family profile completion a required part of onboarding for new and returning parents. Email/password users complete setup after verification and sign-in; Google users proceed to profile checking after authentication. Only a successfully persisted, valid family profile unlocks the signed-in parent experience. Preserve guest browsing and administrator access.

## User Stories

1. As a parent, I want a map in centre details, so that I can understand where the centre is while evaluating it.
2. As a parent with a saved home location, I want to see home-to-centre routing, so that I can assess the journey from home.
3. As a parent with a saved workplace, I want to see home-to-centre-to-workplace routing, so that I can assess the complete commute through the centre.
4. As a parent without a workplace location, I want a clear home-to-centre comparison, so that I can evaluate centres without supplying optional information.
5. As a parent, I want labelled Home, Centre and Workplace markers, so that I can identify each stop.
6. As a parent, I want the journey legs distinguished by labels and line styling as well as colour, so that I can follow the route clearly.
7. As a parent, I want travel time and distance for each journey leg, so that I can see which part accounts for the journey.
8. As a parent, I want a combined travel time and distance when both requested legs are available, so that I can compare complete journeys.
9. As a parent, I want travel time to exclude time spent dropping my child off, so that the estimate reflects travel alone.
10. As a parent who drives, I want driving routes, so that I can assess centres using my travel mode.
11. As a parent who uses public transport, I want itineraries that account for their walking and transfer legs, so that the comparison reflects the complete transport journey.
12. As a parent who walks, I want walking routes, so that I can assess centres reachable on foot.
13. As a parent who cycles, I want cycling routes, so that I can assess centres using that travel mode.
14. As a parent, I want driving initially selected, so that the first commute view has a consistent default.
15. As a parent, I want one selected travel mode applied to both journey legs, so that I can interpret the comparison consistently.
16. As a parent comparing several centres, I want my selected travel mode retained during the session, so that I do not need to reselect it for every centre.
17. As a parent, I want representative weekday and weekend estimates where supported, so that I can compare those travel conditions.
18. As a parent, I want the actual sample dates and 08:00 Singapore-time assumptions labelled, so that I understand what the estimates represent.
19. As a parent comparing centres, I want the same representative conditions reused, so that the estimates are comparable.
20. As a parent, I want selecting a weekday or weekend summary to show its corresponding route, so that the map and numbers agree.
21. As a parent, I want a single estimate when day-dependent variation is unverified, so that I am not shown an invented difference.
22. As a parent, I want to compare travel without departure-time or drop-off controls, so that choosing a centre remains straightforward.
23. As a parent, I want to keep reading centre details while a route loads, so that map loading does not interrupt my evaluation.
24. As a parent, I want successful legs to remain visible when another leg fails, so that available information remains useful.
25. As a parent, I want an unavailable leg clearly identified and incomplete totals withheld, so that I do not mistake partial information for a complete journey.
26. As a parent, I want to retry a failed route, so that I can recover from a temporary service problem.
27. As a parent, I want the centre location retained when routing fails, so that I can still understand where it is.
28. As a parent, I want a clear message and an edit-profile action for an unresolvable home or workplace, so that I can correct my saved location.
29. As a parent, I want unavailable provider data identified honestly, so that a straight-line approximation is not presented as a routed journey.
30. As a parent who changes a saved location, I want the old route invalidated, so that I see estimates for my current profile.
31. As a parent opening centres or switching modes quickly, I want outdated responses ignored, so that the visible route always belongs to my current selection.
32. As a parent using a shared device, I want personal route state cleared on signout or account change, so that another account cannot see my journey.
33. As a guest, I want to retain existing access to centre details and see the centre location, so that I can explore before registering.
34. As a guest, I want a sign-in prompt for personalised routes, so that I know how to obtain a comparison using my family profile.
35. As a guest, I want to explore without supplying a home or workplace, so that browsing remains simple.
36. As a new email/password user, I want profile setup after email verification and sign-in, so that onboarding follows the account-verification sequence.
37. As a new Google user, I want to proceed to profile checking after authentication, so that I can complete onboarding through my chosen sign-in method.
38. As a returning parent with an incomplete family profile, I want to be directed to required setup, so that personalised features have the information they need.
39. As a returning parent with a valid saved profile, I want to continue without repeating setup, so that onboarding does not become a recurring obstacle.
40. As a parent, I want required profile information clearly validated, so that I know what must be completed.
41. As a parent, I want existing valid defaults to count as filled, so that I can complete setup without unnecessary edits.
42. As a parent, I want workplace information to remain optional unless I choose workplace-based matching, so that I provide only information relevant to my preferences.
43. As a parent, I want household income to remain optional in the form, so that I can finish setup without providing it.
44. As a parent, I want profile completion to remain independent of OneMap availability, so that an external mapping outage cannot prevent onboarding.
45. As a parent saving my profile, I want successful server persistence to be confirmed before continuing, so that my setup remains available on a later visit.
46. As a parent whose profile save fails, I want my entries retained and a retry option, so that I do not have to re-enter the form.
47. As a parent whose profile cannot be loaded, I want a retry state, so that a service failure does not create a duplicate or falsely treat my profile as missing.
48. As a parent, I want navigation and overlays to respect mandatory setup, so that incomplete onboarding cannot be bypassed accidentally.
49. As a parent, I want to sign out during required setup, so that I can return to guest browsing.
50. As a parent with named family profiles, I want the currently loaded profile's identity and name preserved, so that saving setup does not rename or replace my existing profiles.
51. As a parent, I want saved priority weights to satisfy the backend contract, so that valid profile submissions can succeed.
52. As an administrator, I want my existing access to remain independent of parent profile setup, so that parent onboarding does not block administration.
53. As a mobile user, I want summaries and route details to fit the modal, so that I can compare centres on a small screen.
54. As a keyboard or assistive-technology user, I want labelled controls and a readable text breakdown, so that I can use the comparison without relying on map interaction or colour alone.
55. As a parent, I want centre contact information, attributes and reviews to remain available, so that the map complements my existing evaluation.
56. As a parent, I want existing centre rankings to retain their behaviour, so that adding the map does not silently change my matches.

## Implementation Decisions

- Extend the existing centre-details modal with an inline commute section below the address, inheriting the current visual system. Preserve modal close behaviour, contact information, attributes and reviews. Do not add a dedicated centre page or Commute tab.
- Use the installed Leaflet/React Leaflet libraries with OneMap basemaps. Start map/route loading when details open, without routing every directory card.
- Keep OneMap search/routing and credentials behind the existing FastAPI backend. Introduce a dedicated commute display contract; retain the current matching adapter, including its public-transport policy and fallback, for existing matching consumers.
- Respect accepted frontend ADR-0001, which separates display estimates from matching. Preserve backend ADR-0003's identity/application-user lifecycle, ADR-0006's multiple named and owned family preference profiles, and ADR-0007's matching semantics. Replacing the matching fallback globally would contradict ADR-0007 and is outside this change.
- Use the currently loaded family profile and its backend identifier. The frontend currently loads the first returned profile; retain that selection behaviour for this change. Do not introduce a new selector or singleton profile data model. Preserve loaded profile names and identifiers when updating.
- Offer driving, public transport, walking and cycling, initially selecting driving. Apply the selected mode to both journey legs and retain it across centre comparisons during the signed-in browsing session. Reset personal route state on signout/account change and invalidate routes when the loaded profile or its locations change. Public transport may contain walking and transfer legs within its itinerary.
- Include centre-to-workplace whenever the loaded profile supplies a workplace, independently of its matching location preference. Show a single home-to-centre leg when no workplace is supplied. Report per-leg durations/distances and combined travel-only totals only when all requested legs are available.
- For verified date-dependent modes, use representative samples at 08:00 Asia/Singapore on the next upcoming Wednesday and Saturday. Label actual dates and time. Initially select Weekday; selecting a summary changes displayed geometry. Reuse one sample pair across the comparison session and refresh expired samples consistently. These are illustrative conditions, not all-day averages, holiday-adjusted estimates or traffic guarantees. Show a single estimate for modes whose day-dependent variation cannot be verified.
- For public transport, start the onward request at the first leg's estimated arrival time, without adding drop-off duration. If that arrival cannot be determined, do not invent an onward departure time; report the affected leg as unavailable. Retain any valid available leg and omit incomplete totals.
- Add a public centre-location operation that returns only the centre identifier, coordinates and availability. Add an authenticated parent commute operation accepting the centre, owned profile identifier, mode and optional previously issued sample metadata. The server derives personal locations from the owned persisted profile and selects/validates sample conditions. Reject another parent's profile without revealing its data.
- The commute response must expose anchors, per-leg real geometry, explicit availability and provider source, unambiguous duration/distance units, sample metadata and complete-only totals. Use seconds and metres at the API boundary and readable units in the UI. Missing geometry or unusable upstream results are explicit failures, not successful approximations.
- Use exact returned-postcode validation for OneMap relevance-ranked search results. Legacy cached results that lack verification cannot bypass that check. Cache verified results by relevant anchors, mode and sample date/time; cache lifetime, geometry transport encoding, bounded request behaviour and token renewal mechanism remain implementation choices within the provider contract.
- Cancel or ignore stale requests after centre/mode/profile/account changes. A failed leg remains visibly unavailable with retry; successful legs stay visible. Retain the centre-location map if routing fails; if the centre cannot be resolved, retain the address and explain map unavailability. An unresolvable personal location offers Edit family profile.
- Make parent onboarding distinguish authentication pending, verification pending, profile loading, profile required, saving, load/save error and ready. Resolve eligibility before exposing protected parent navigation or overlays. Keep signout available and preserve existing guest browsing and administrator authorization.
- Email/password registration continues to send verification and sign out. The transient registration session must not reveal the signed-in parent app. After verified sign-in or Google authentication, apply the shared session/profile checks, including restored authentication sessions. Keep unrelated watchlist loading independent of profile eligibility.
- Completion requires a successfully persisted profile with six-digit home postcode, child level, citizenship, care type, enrolment month and positive budget. Validate workplace formatting when present and require it for WORKPLACE/EITHER matching preferences. Existing defaults may count. Household income remains optional to the parent; retain compatible defaults and backend bounds for household values and priorities. Do not require OneMap resolution to complete setup.
- Align the submitted priority payload with the existing backend three-weight invariant: vacancy, cost and travel weights must sum to one. Preserve the user's priorities and existing ranking algorithms; correct incompatible frontend payload conversion rather than changing backend validation.
- Server data determines whether a saved profile exists and is complete. Local storage may preserve drafts but cannot unlock required setup. A failed server read is distinct from an empty profile collection. Preserve inputs after a save failure, support retry, and prevent duplicate creation or stale responses from another session. After a successful first save, continue to the existing Find my matches destination.
- Retain the existing profile CRUD/ownership model. No new database completion flag, saved travel-mode column or schema migration is required for this feature. Do not introduce a global profile gate on existing anonymous matching, reviews or administrative API contracts; enforce ownership and valid-profile requirements on the new personalised commute operation.
- Implement clear module responsibilities for profile validation/conversion, onboarding orchestration, commute API/provider normalisation, comparison-session state and the inline map view. Prefer existing public boundaries for tests; internal extraction must not require testing every helper or control implementation.

## Testing Decisions

- A good test asserts externally observable behaviour and contract outcomes: what a parent can access, which saved profile is used, which route/estimates are displayed, which errors appear, and whether incomplete totals are omitted. Avoid assertions about private helper calls, internal component structure or incidental rendering details.
- Use the highest practical seam for each independently deployed side: parent app journeys through the existing authentication/profile/API boundaries, and FastAPI request/response integration tests for the server. Use real feature modules inside those boundaries. Mock Firebase/external HTTP/OneMap rather than scattering mocks across application internals; no new seam is required solely to test individual helpers.
- Cover email signup's transient session and verification sequence, Google authentication, restored sessions, returning incomplete/complete parents, required-field/default/conditional-workplace validation, failed reads, failed saves with retained entries, successful server-save gating, local-only drafts, duplicate callbacks, account changes, administrator entry and signout back to guest browsing. A watchlist failure must not prevent a valid profile reaching ready.
- Cover guest centre location without personal data; owned-profile enforcement; home-only and workplace journeys; all four modes; selected mode retention; sample labels/selection; 08:00 Singapore-time weekday/weekend boundaries; sample expiry and consistent refresh; profile-location changes; stale response suppression; partial/unavailable routes; retry; missing geometry; and withheld incomplete totals. Verify each mode's metrics/geometry using deterministic provider fixtures.
- Preserve existing matching behaviour with regression coverage for its public-transport and straight-line fallback paths. The new display path must report upstream failure explicitly and must not use that fallback as a map route.
- Use limited provider-contract fixture checks where necessary to verify geometry, units, exact-postcode matching and sequential public-transport timing; exercise their normalized results through the public commute API. Do not make routine tests depend on live OneMap, user credentials or real family locations.
- Prior art includes existing frontend Vitest account/family-profile/centre API-wrapper tests with mocked Firebase, fail-closed fetch doubles and HTTP-error assertions; backend pytest/FastAPI TestClient tests with isolated SQLite and authentication overrides; and existing matching tests with injected OneMap clients and fallback fixtures. Extend these patterns before introducing another framework.
- Check the actual modal on desktop and mobile: readable leg/total summaries, loading without blocking other details, labelled markers/controls, keyboard access, colour-independent leg identification, map resize/fit and scroll behaviour, and preserved close/contact/review interactions. Record which checks are automated and which are manual.
- Run both repositories' existing required checks during implementation. Specification publication itself does not claim that application tests or live provider checks have passed.

## Out of Scope

- Turn-by-turn navigation, departure-date/time controls, arrival-time planning, drop-off duration settings or any other trip-planning workflow.
- Independently selected modes for different journey legs.
- Statistical averages across all weekdays/weekends, all-day sampling, holiday adjustments or unverified traffic-aware claims.
- Changes to matching/ranking algorithms, Travel Fit semantics or existing matching fallback behaviour.
- A new centre-details page, separate Commute tab, visual redesign or changes to existing guest-access limits.
- Collecting guest home/workplace locations, adding a family-profile selector, replacing the backend profile portfolio, persisting travel mode across devices or introducing database completion flags.
- A new global profile requirement on existing API contracts, account-role changes, administrator onboarding or broad authentication redesign.
- Deployment, production credential provisioning and unrelated account/profile/data cleanup.

## Further Notes

- This issue synthesises the completed design interview and confirmed design. No product decisions remain open; application implementation has not started.
- Work spans the frontend and the existing sibling backend. Profile onboarding is independently deliverable and can be completed first; commute integration then builds on valid persisted profiles without changing matching.
- The backend already has OneMap geocoding and public-transport routing for matching, but its current return values omit geometry and may silently fall back to straight-line estimates. Reuse appropriate infrastructure while preserving a distinct, honest display contract.
- The first route-integration task is to verify the actual OneMap REST contract for authentication, public-transport date/time semantics, onward departure, geometry, units and supported day dependence. Official MCP documentation alone does not establish the REST contract. If essential capability cannot be verified or supported, report that concrete constraint for a product decision before building the dependent feature; do not silently omit an agreed mode or invent data.
- Provider references: [OneMap routing](https://www.onemap.gov.sg/apidocs/routing), [authentication](https://www.onemap.gov.sg/apidocs/authentication), [search](https://www.onemap.gov.sg/apidocs/search) and [official MCP documentation](https://www.onemap.gov.sg/apidocs/mcp).
