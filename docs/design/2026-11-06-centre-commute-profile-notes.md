# Centre commute routes and required family profiles

Status: interview complete. The user confirmed shared understanding and accepted the design, including the sample conditions, on 2026-11-06.

## Confirmed decisions

1. Add a OneMap commute comparison to centre details, showing the route, estimated travel time, and distance. This helps families compare centres; turn-by-turn navigation and trip planning are outside this change.
2. Require family profile completion for new signups and returning users with incomplete profiles before continuing into the signed-in app.
3. Offer driving, public transport, walking, and cycling. Initially select driving.
4. Require a valid home postal code and the existing child level, citizenship, care type, enrolment month, and budget fields. Existing defaults may count. Workplace and household income remain optional, except that workplace is required for workplace-based matching.
5. For email signups, complete the family profile after email verification and sign-in. Google signups proceed directly to profile setup after authentication.
6. Keep existing guest access to centre details. Guests see the centre location and a sign-in prompt for a personalised commute route.
7. Leave matching and centre ranking unchanged in this change. Actual journey-time-based ranking is separate work.
8. Apply one selected travel mode to both journey legs. Public-transport itineraries may include walking and transfers; independently choosing a mode for each journey leg is outside this change.
9. Retain the selected travel mode while comparing different centres. Home and workplace continue to come from the family profile.
10. Accept correctly formatted six-digit postal codes for profile completion without requiring successful OneMap resolution. If a location cannot be resolved, explain this in the map and offer a way to edit the family profile. OneMap availability must not block profile completion.
11. If only one journey leg succeeds, keep it visible, clearly identify the unavailable leg, offer retry, and withhold the complete-journey total. If neither leg succeeds, retain the centre location where available and explain that the commute route is unavailable.
12. Exclude time spent at the centre from travel time estimates. Do not add a drop-off-duration setting.
13. Do not add user-facing departure-date/time controls. Use representative weekday and weekend estimates with their sample assumptions labelled, rather than claiming all-day or statistical averages. Show a single estimate for modes where weekday/weekend variation cannot be verified.
14. When a workplace is provided, show home-to-centre and centre-to-workplace travel time estimates separately, along with the combined travel time. The combined total excludes time spent at the centre.
15. Keep the existing centre-details modal and add an inline commute section below the address. Include travel-mode controls, weekday/weekend summaries, and per-leg totals. Selecting a summary switches the displayed route.
16. Use 08:00 Singapore time on the next upcoming Wednesday and Saturday for representative weekday and weekend estimates. Label the actual sample conditions and reuse them while comparing centres.

The requested commute route is home to centre when no workplace is provided, and home to centre to workplace when one is provided.

## Existing behaviour relevant to the design

- Centre details currently use a modal, without a map.
- The family profile stores home and workplace postal codes, without an existing travel-mode setting.
- Profile completion currently acts as a post-login prompt; only matching enforces completion.
- Email signup creates a transient authenticated session before verification and signout. The eventual mandatory setup must respect the agreed verification sequence.
- Current completion checks are weaker than profile-save validation. A failed remote profile save can currently be treated as locally complete. The mandatory flow needs a consistent definition of successful completion.
- Current travel scoring uses postal-sector similarity, not calculated commute time. The map will not change this ranking.
- The sibling backend already has a OneMap adapter for matching. It returns durations/distances without route geometry and can silently fall back to straight-line estimates. The centre-details contract needs actual route geometry and explicit unavailability, while existing matching behaviour remains unchanged.
- The backend supports multiple named family preference profiles under ADR-0006; the frontend currently loads the first profile. This change must not replace that portfolio with a singleton data model.

## Implementation prerequisite

Verify the public-transport API contract before implementation depends on it. No product decisions remain open from this interview.

## Accepted design

The accepted design is in [the design document](../superpowers/specs/2026-11-06-centre-commute-profile-design.md). It records confirmed requirements, sample conditions, and builder discretion. [ADR-0001](../adr/0001-separate-commute-display-from-matching.md) records the separation from matching.

## External constraints found so far

[OneMap routing](https://www.onemap.gov.sg/apidocs/routing) documents a start/end pair and the driving, walking, cycling, and public-transport mode enum. Two separate route requests are the baseline inference for the two-leg commute; an external platform's multistop UI is not proof of a waypoint API.

[OneMap authentication](https://www.onemap.gov.sg/apidocs/authentication) requires a token for routing. Basemaps do not require the same token. [Official MCP documentation](https://www.onemap.gov.sg/apidocs/mcp) describes date/time inputs for public transport, but the exact REST public-transport contract still needs verification before implementation.
