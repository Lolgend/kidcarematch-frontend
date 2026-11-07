# Backend handover: centre details and commute comparison

Status: **Accepted with the [frontend specification](../specs/centre-details-page-and-commute-deviation.md) on 2026-11-07.** Prepared for [Approve the centre details specification and backend developer handover](https://github.com/Lolgend/kidcarematch-frontend/issues/33). The user accepted all four synthesis proposals, including this opt-in schema, selected-cycle expiry and operational-budget ownership/release hold, then explicitly accepted both complete artifacts. This file is instructions for a later backend implementation, not a claim of current support. The sibling backend remains read-only throughout wayfinder.

## Required change and current boundary

Extend strict display routing to provide an opt-in direct home → workplace alternative, certified comparable duration semantics and separately negotiated Wednesday/Thursday/Friday public-transport sampling. Keep legacy via-centre fields/meanings and all matching behavior unchanged.

Current evidence: [display-contract research](https://github.com/Lolgend/kidcarematch-frontend/blob/8c92703657dbb48f12e5da78cd6df434145663bd/docs/research/centre-details-deviation-contract.md), [sampling investigation](https://github.com/Lolgend/kidcarematch-frontend/blob/a2f643eedb225e7cafc027f371e76588db5e235a/docs/research/centre-details-public-transport-samples.md), frontend `src/api.js`, `src/commute/commuteSession.js`, and read-only backend `schemas/commute.py`, `core/commute.py`, `api/v1/centres.py` under `src/kidcarematch_backend/`. The research links immutable source snapshots. A 2026-11-07 source check confirmed the gaps below; no backend changes/tests or live provider calls were performed.

| Existing capability | Gap for this feature |
| --- | --- |
| `POST /api/v1/centres/{centre_id}/commute`, saved profile, mode, optional `sample_pair` | No direct route, comparison eligibility, capability negotiation or classified reasons |
| Exact next-upcoming Wednesday/Saturday pair at 08:00 SGT | Cannot request Thursday/Friday by supplying arbitrary dates to this contract |
| Via-centre legs/complete-only totals, real provider geometry, seconds/metres | Direct baseline must be separate; do not append it to via `legs` or borrow matching values |
| PT onward request uses first-leg arrival | Arrival can be synthesized from itinerary duration; that alone cannot prove elapsed waiting semantics |
| Other modes omit provider date/time | They remain provider-default estimates, not scheduled traffic forecasts |
| Active-parent and owned-profile checks; public centre-location operation | Centre ID stability and authoritative six-centre guest-detail eligibility need explicit verification |

The frontend glossary's commute deviation is a signed **time** difference. Backend glossary language also mentions distance and currently describes journey legs as the via-centre legs. Reconcile documentation during backend implementation: the direct route has its own home → workplace leg; distance is supporting data, not a second product headline. Do not silently replace either glossary's meaning.

## Target negotiation and compatibility

The user accepted these exact names and shapes in the four-proposal HITL round, then explicitly accepted the complete artifact package. Implementation/release readiness checks still apply.

Add authenticated `GET /api/v1/commute/capabilities`, subject to the existing active-parent authorization. It performs no geocoding/provider routing and returns no profile or coordinates:

```json
{
  "direct_baseline_contract": "direct_baseline_v1",
  "sampling_contract": "weekday_0800_wed_thu_fri_v1"
}
```

Each field is required and either its shown string or `null`. The two capabilities are independent. An older server may return 404; treat that or an unknown/malformed marker as unsupported, retaining the smallest frontend stage. Authentication/service failure is not evidence of permanent capability absence: use the appropriate retry/sign-in state. The commute response must confirm the negotiated contract as well; discovery alone is insufficient.

Keep the existing POST and its authorization. Add `include_direct_baseline: boolean = false` and optional `sampling`. Requests without either opt-in preserve legacy request cost and response semantics, including the two PT samples and exact `sample_pair` validation. Baseline false adds no baseline provider calls. New response fields are additive in legacy sampling mode.

The `sampling` opt-in explicitly negotiates the selected-sample response instead of legacy pair semantics. Do not silently alter a legacy client's pair into Thursday/Friday. `sampling` and a non-null `sample_pair` are mutually exclusive. A request without `sampling` continues to use the old pair rules even when it requests a baseline. Do not assume Pydantic accepting an unknown field proves this feature exists.

### Complete request shape

```typescript
type Mode = "drive" | "pt" | "walk" | "cycle";
type SamplingPolicy = "weekday_0800_wed_thu_fri_v1";
type CommuteRequest = {
  profile_id: number | string;              // Existing owned saved-profile identifier.
  mode?: Mode;                             // Default drive.
  sample_pair?: [string, string] | null;    // Existing ISO pair, legacy policy only.
  include_direct_baseline?: boolean;       // Default false.
  sampling?: {
    policy: SamplingPolicy;
    cycle_id: string | null;               // Null only for a new primary attempt.
    sample_index: 0 | 1 | 2;               // Wed, following Thu, following Fri.
  } | null;                                // Only legal for mode=pt.
};
```

For initial selected-policy evaluation send `cycle_id:null, sample_index:0`. Return server-issued cycle identity and all three allowed dated conditions. Subsequent centres and fallback attempts use that identity plus the selected index. A null cycle with index 1/2 is invalid. The client does not submit personal anchors, arbitrary provider dates/options or a desired comparison-eligibility result.

### Response types and invariants

The following notation specifies JSON shape; `T | null` means a required nullable field unless explicitly marked `?`. Timestamps are timezone-aware ISO 8601; durations/distances are finite nonnegative numbers in seconds/metres. Coordinate arrays use WGS84 actual provider geometry, not illustrative straight lines.

```typescript
type Coordinate = {lat: number; lng: number};
type Totals = {duration_seconds: number; distance_meters: number};
type Reason = {
  code: ReasonCode;
  failure_class: "sample_dependent" | "authentication" | "service"
    | "location" | "conditions" | "not_applicable";
  retryable: boolean;
};
type TransitLeg = {
  mode: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  route: string | null;
  instruction: string | null;
  geometry: Coordinate[] | null;
};
type RouteLeg = {
  from_anchor: "home" | "centre" | "workplace";
  to_anchor: "home" | "centre" | "workplace";
  status: "available" | "unavailable";
  source: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  geometry: Coordinate[] | null;
  arrival_at: string | null;               // Existing field; inspect timing evidence below.
  message: string | null;                  // Safe explanation, not a behavior contract.
  transit_legs: TransitLeg[] | null;
  departure_at: string | null;             // PT requested departure; null for other modes.
  timing: {
    duration_basis: "elapsed_from_requested_departure" | "itinerary_duration"
      | "provider_default" | "unknown";
    arrival_source: "provider_end_time" | "duration_derived" | "not_applicable" | "unknown";
    initial_wait_included: boolean | null;
  };
  reasons: Reason[];
};
type DirectRoute = {
  status: "available" | "unavailable" | "not_applicable";
  legs: RouteLeg[];                         // Exactly one home→workplace leg, or [] if N/A.
  totals: Totals | null;
  reasons: Reason[];
};
type Comparison = {
  status: "available" | "unavailable" | "not_applicable";
  reasons: Reason[];
  certification: {
    duration_basis: "elapsed_from_requested_departure" | "provider_default";
    provider_options_id: string;
  } | null;
};
type Sample = {
  kind: "single" | "weekday" | "weekend";
  sampled_at: string | null;
  legs: RouteLeg[];                         // Existing via-centre journey only.
  totals: Totals | null;                    // Existing complete-only via total.
  conditions: {
    conditions_id: string;
    timing_basis: "scheduled_departure" | "provider_default";
    initial_departure_at: string | null;
    provider_options_id: string;
  };
  via_status: "available" | "partial" | "unavailable";
  reasons: Reason[];
  direct_route?: DirectRoute;               // Required when baseline explicitly requested/supported.
  comparison?: Comparison;                 // Same opt-in rule; never inferred from omission.
};
type CommuteResponse = {
  centre_id: number;
  profile_id: number | string;
  mode: Mode;
  anchors: {home: Coordinate | null; centre: Coordinate | null; workplace: Coordinate | null};
  sample_pair: [string, string] | null;      // Existing pair in legacy policy; null in selected policy.
  samples: Sample[];
  comparison_contract: "direct_baseline_v1" | null;
  sampling_contract: SamplingPolicy | null;
  evaluation: {
    evaluation_id: string;
    evaluated_at: string;
    profile_revision: string;              // Opaque identity of saved routing-relevant profile state.
    anchor_revision: string;               // Resolved home/centre/workplace snapshot, no plaintext PII.
  };
  sampling: {
    policy: SamplingPolicy;
    cycle_id: string;
    cycle_expires_at: string;
    selected_index: 0 | 1 | 2;
    allowed_samples: [
      {sample_index: 0; conditions_id: string; departure_at: string},
      {sample_index: 1; conditions_id: string; departure_at: string},
      {sample_index: 2; conditions_id: string; departure_at: string}
    ];
  } | null;
};
```

Apply this full metadata shape to negotiated responses (either opt-in). A request with neither opt-in may return the unchanged legacy response, without these extra fields. Retain all existing legacy field meanings; optional transit metadata remains preserved. A consumer requires the expected response marker plus well-formed relevant fields before using a capability.

For selected PT policy, `samples` has exactly one `kind:"weekday"` sample whose timestamp/conditions match `sampling.selected_index`, `sample_pair:null`, and `sampling_contract` confirms the policy. For legacy PT policy return both existing samples/pair; `sampling:null`, `sampling_contract:null`. Other modes retain one `kind:"single", sampled_at:null` sample and provider-default conditions. Baseline capability can be enabled in either sampling regime.

`profile_revision` is shared across centre evaluations of the same saved routing-relevant profile state; `anchor_revision` may differ by centre. `conditions_id` identifies mode, provider/options and initial dated sample, excluding centre so a comparison set can share it. It is not an anchor/ownership token. For provider-default modes it identifies the untimed semantics and effective options, not a scheduled traffic condition. The frontend also binds results to its local account and request generation; server echoes never replace those checks.

For `available` legs require finite metrics, actual nonempty usable geometry and a provider source. Unavailable legs have null metrics/geometry/source and at least one stable reason. Via totals exist only if every configured required leg is complete; partial via state preserves the valid leg but has null totals. Direct available requires its complete single leg/totals; unavailable has null totals; not applicable has `legs:[], totals:null`. No workplace is not applicable, not zero. A configured unresolved workplace is unavailable.

`comparison.status=available` requires complete direct/via journeys, common owned anchor snapshot, compatible mode/provider/options and certified duration semantics; certification is non-null and reasons empty. Otherwise certification is null and reasons explain why. The frontend still validates complete inputs before subtracting; a contradictory or malformed response fails closed for comparison. No backend numeric deviation is required; preserve raw signed arithmetic by returning unrounded source durations.

## Timing certification

Resolve/copy the owned saved profile once per evaluation. Reuse consistent home/workplace/centre anchors for both alternatives. Resolve direct independently of centre availability: a known centre with unresolved location must not destroy a valid baseline.

For PT, direct and home → centre depart at the same initial sample timestamp. Centre → workplace starts at first-leg normalized arrival, with zero drop-off dwell, rolling date and time across midnight when needed. Compare elapsed travel from requested departure to arrival with initial waiting, transfers and walking included consistently. Use the same provider, transit options and itinerary selection policy for both alternatives; serialize a stable options identity.

Example: request 08:00; vehicle begins 08:05; first-leg arrival is 08:15; itinerary duration is 10 minutes. Elapsed first-leg duration must be 15 minutes and onward departure 08:15. A direct trip must also include any initial wait relative to 08:00. Comparing one itinerary-only duration to an elapsed duration is ineligible even if geometry exists.

Current duration-derived arrival may remain useful route information but cannot certify elapsed-time comparability unless backend evidence verifies compatible elapsed semantics and inclusion of initial waiting for every required leg. Otherwise keep routes, set `comparison` unavailable with `timing_unverified`, and expose timing provenance internally. Do not label synthetic arrival as a provider timestamp or silently change the legacy meaning of a duration field.

Drive/walk/cycle certify only compatible provider-default estimates, never time-specific traffic forecasts. Departure/arrival metadata for scheduled conditions is null. If provider-dependent time sensitivity cannot be reconciled, return unavailable comparison rather than asserting compatibility.

## Selected-sample cycle, expiry and orchestration

Accepted target cycle rule: choose the next Wednesday 08:00 SGT strictly after server now; before Wednesday 08:00 the same day's primary is allowed. Indices 1/2 are that primary's immediately following Thursday/Friday at 08:00, not independently calculated next weekdays. All three share one cycle identity. **Expire the new cycle at its primary Wednesday 08:00**, even if a later fallback date is still future. This preserves the next-upcoming-primary refresh boundary and prevents a fallback keeping an old cycle alive. The user explicitly accepted this policy-specific rule; legacy pairs retain their existing earlier-pair-expiry behavior.

Issue/validate cycle identity server-side; it must denote exactly those dates, version and expiry, not be an unchecked client assertion. A signed stateless token or validated server representation is an implementation choice. Reused identity must remain in the active cycle and use an allowed index; expired cycle → 409 `sample_expired`, unsupported index/policy or contradictory request → 422. Expose `cycle_expires_at` for coordinated frontend refresh. `evaluated_at` and cycle expiry do not promise route freshness or provider schedule validity.

Frontend coordinates the relevant comparison set, not separate autonomous per-centre fallback loops:

1. Obtain the primary condition, evaluate required centres/components using that shared identity, and keep a request generation for the set.
2. Advance only for a classified sample-dependent failure of a required component. Advance the **whole set**, remove its old active metrics/overlays and evaluate with the next allowed index.
3. An independent success may remain visible during same-context retry. It cannot remain as an active comparable result after the sample changes. Complete surviving components at the final selected sample can remain visible even if the comparison is unavailable.
4. After Friday failure stop and show unavailable/retry. Endpoint transport errors without a trustworthy classification do not trigger date cycling. User 401/403 stops unauthorized output; confirmed service outage is not treated as route/date absence.
5. On expiry, discard the cycle and refresh the entire set once from a fresh primary. If another expiry/409 occurs during that recovery, stop with retry instead of an automatic refresh loop. A normal later expiry is a new lifecycle event, not permission for continuous background retries.

Public-transport fallback is at most three dated evaluations per centre per attempt. With a workplace and baseline enabled that is up to three provider route calls per dated evaluation (home → centre, onward, direct), before bounded provider-auth renewal. First-leg failure prevents PT onward. Backend must not also perform hidden cross-date retries under a selected-sample request; one coordinator owns date advancement. No weekend queries are needed in selected policy. Legacy consumers retain their existing pair queries.

## Failure classification and HTTP behavior

Keep existing auth/ownership meanings: user authentication required → 401; forbidden active role/suspension → 403; absent/other-parent profile → indistinguishable 404; absent centre → 404; invalid request/saved home input → 422. Preserve legacy invalid/expired pair → 409 `sample_expired`. General endpoint errors remain load failures. Safe machine error bodies may add stable `code`/`failure_class` without disclosing ownership details.

Provider/route component failures remain explicit states within HTTP 200 where a useful evaluation can be returned. Preserve independent successes. Provider authorization exhaustion is a service/provider problem, not proof the parent needs to sign in. A provider 401 is distinct from an endpoint user 401.

Accepted target `ReasonCode` vocabulary:

| Code | Class | Behavior |
| --- | --- | --- |
| `no_itinerary` | sample_dependent | May advance PT weekday if absence is confirmed for that sample |
| `direct_unavailable`, `via_centre_incomplete` | conditions | Comparison summary; consult component reasons before deciding retry/date advancement |
| `home_unresolved`, `centre_unresolved`, `workplace_unresolved` | location | Edit profile for personal locations; date changes do not repair this |
| `workplace_not_configured` | not_applicable | Home-only; no baseline/deviation |
| `timing_unverified`, `conditions_mismatch` | conditions | Retain usable routes, no certified comparison; no calendar retry unless a separate sample-dependent cause is verified |
| `provider_timeout`, `provider_unavailable`, `provider_auth_failed`, `evaluation_budget_exhausted` | service | Retry appropriate to service; do not cycle weekdays as a generic repair |
| `invalid_provider_payload`, `geometry_unavailable` | service | Default conservative classification; no date cycling on malformed/unverified data |

`ReasonCode` is the literal union of the codes in this table; unknown future codes are treated conservatively as unavailable with no automatic date cycling. Auth failures normally use HTTP errors, rather than a component route result. `retryable` controls whether a retry action is meaningful, not authorization to loop automatically. A nonempty reason list may report multiple failed requirements; neither prose messages nor status 200 determine eligibility.

## Ownership, privacy, caching and operational limits

- Authorize before any personal geocoding/routing. Obtain locations from the owned persisted profile; never accept client-supplied home/workplace coordinates as authority. Preserve exact-postcode validation and distrust unverified legacy geocoding cache entries.
- Keep public centre location separate and free of profile data. Share URLs contain centre identity only. Verify guest-detail eligibility and stable canonical ID lookup for the page; if backend lacks an authoritative preview/detail access contract, report the concrete change needed before calling that gate complete.
- No new durable personal route cache is required. Frontend route responses remain private and ephemeral; sign-out/account/profile/location changes clear them. Diagnostics must redact tokens, postal codes, coordinates, geometry and profile identifiers unless explicitly authorized for controlled evidence capture.
- If backend caching is added later, require explicit bounded retention and keys covering ownership, profile/anchor revisions, centre, mode/options, policy and selected condition; do not use postcode-cache lifetime or token expiry as route freshness. No public/shared caching of serialized personal responses.
- Baseline retrieval is opt-in. Preserve old query counts and matching calls. Each provider request must have a finite timeout, bounded authentication retry and an aggregate evaluation deadline; return independent successes plus `evaluation_budget_exhausted` when the deadline prevents a component.
- **Accepted release responsibility:** backend developer measures provider/deployment latency and rate limits, then records numeric per-call timeout, aggregate deadline, maximum concurrency, auth retry bound, cancellation behavior and load evidence before capability enablement. Existing synchronous per-call timeout alone is not an aggregate budget. This planning package does not invent a numeric SLA. Until that record exists, the dependent capability's release is on hold. The user explicitly accepted this owner/gate.

## Request/response examples

All values are synthetic contract examples, not provider observations. Geometry is omitted from excerpts; a complete available response must contain actual validated provider geometry and every required field above.

Selected-policy request, new attempt:

```json
{
  "profile_id": "example-owned-profile",
  "mode": "pt",
  "include_direct_baseline": true,
  "sampling": {
    "policy": "weekday_0800_wed_thu_fri_v1",
    "cycle_id": null,
    "sample_index": 0
  }
}
```

Selected-policy success excerpt, evaluated 2026-11-07 SGT:

```json
{
  "comparison_contract": "direct_baseline_v1",
  "sampling_contract": "weekday_0800_wed_thu_fri_v1",
  "sample_pair": null,
  "sampling": {
    "policy": "weekday_0800_wed_thu_fri_v1",
    "cycle_id": "example-cycle-token",
    "cycle_expires_at": "2026-11-11T08:00:00+08:00",
    "selected_index": 0,
    "allowed_samples": [
      {"sample_index": 0, "conditions_id": "example-wed-pt-options", "departure_at": "2026-11-11T08:00:00+08:00"},
      {"sample_index": 1, "conditions_id": "example-thu-pt-options", "departure_at": "2026-11-12T08:00:00+08:00"},
      {"sample_index": 2, "conditions_id": "example-fri-pt-options", "departure_at": "2026-11-13T08:00:00+08:00"}
    ]
  },
  "samples": [{
    "kind": "weekday",
    "sampled_at": "2026-11-11T08:00:00+08:00",
    "totals": {"duration_seconds": 2520, "distance_meters": 6000},
    "direct_route": {
      "status": "available",
      "totals": {"duration_seconds": 1800, "distance_meters": 4500},
      "reasons": []
    },
    "comparison": {
      "status": "available",
      "reasons": [],
      "certification": {"duration_basis": "elapsed_from_requested_departure", "provider_options_id": "example-options"}
    }
  }]
}
```

A Thursday retry reuses the issued cycle token with index 1, then refreshes every centre in the set to the returned Thursday conditions. These dates are internal; they are not interface copy.

Failure/not-applicable excerpts (all other independently successful fields remain intact):

| Case | Direct state/totals | Via state/totals | Comparison |
| --- | --- | --- | --- |
| Direct timeout | unavailable/null, provider_timeout | available/complete | unavailable, direct_unavailable plus component service reason; certification null |
| One via leg fails | available/complete | partial/null, successful leg retained | unavailable, via_centre_incomplete; certification null |
| PT elapsed semantics unverified | Independently usable | Independently usable | unavailable/timing_unverified; certification null |
| No workplace configured | not_applicable/null, empty legs | Home → centre only, complete if usable | not_applicable/workplace_not_configured; certification null |
| Configured workplace unresolved | unavailable/null | partial/null if home → centre succeeds | unavailable/workplace_unresolved; certification null |

## Required backend work and release evidence

Work belongs to a later backend implementation session. Do not implement during this wayfinder session. Each capability stays disabled until its relevant rows pass; evidence must identify the deployed build and contract version.

| Gate | Required implementation/evidence |
| --- | --- |
| Contract and capability negotiation | Capability endpoint, strict opt-in validation, independent markers, response-shape validation, legacy/new request fixtures; unknown-field acceptance/HTTP 200 never enables a capability |
| Legacy compatibility | No-opt-in request retains sample-pair/legs/totals semantics and provider call counts; baseline false performs no direct queries; old clients remain functional; unsupported clients degrade to supported estimates |
| Ownership and anchors | Guest personal request 401; forbidden roles 403; absent/foreign profile same 404; no private values on public location; same owned profile snapshot reused within evaluation; known-unresolved centre preserves direct |
| Direct geometry and completeness | Real complete home → workplace geometry, seconds/metres; independent failures, null incomplete totals; no straight-line or matching substitute |
| Timing certification | Initial-wait fixture (08:00 request, 08:15 arrival, 10-minute itinerary), sequential onward/date rollover, invalid/missing endTime, duration-derived arrival provenance, same provider/options; eligibility only with verified semantics |
| Selected weekday policy | Correct Wed/Thu/Fri dates around Tuesday/Wednesday 08:00 boundaries; exact cycle issuance/reuse/expiry; no Saturday; invalid/mixed-cycle/mutually exclusive request tests; one selected sample per response |
| Failure classification | No-itinerary sample failure, outage, provider/user auth distinction, malformed payload, timeout, independent component success, bounded budget exhaustion; stable codes and no generic date cycling |
| Consistent comparisons | Same selected conditions/profile revision across centres; within-evaluation direct/via compatibility; reject stale/mismatched/expired context; coordinated frontend set refresh and late-response tests |
| Operational readiness | Recorded numeric bounded evaluation/concurrency/rate-limit policy and measured load evidence; no baseline cost for legacy requests; no hidden cross-date retry loop |
| Page access and lookup | Canonical ID lookup survives rename/direct refresh; authoritative guest preview/detail eligibility verified or gap fixed; no URL bypass; resumed sign-in/setup destination reauthorized |
| Privacy | Private responses not publicly cached; no personal data in shared URL; account/profile changes clear/deny stale data; sanitized fixtures and evidence |
| Unchanged matching | Matching scores/ranking/provider fallback regression results unchanged for fixed inputs; display outage yields unavailable rather than inherited approximate route |
| Documentation | Backend ADR-0009 presentation exception recorded, ADR-0007 matching semantics preserved; glossary direct-route/time-metric distinction reconciled; published capability and error schemas match implementation |

Frontend acceptance scenarios live in the [specification](../specs/centre-details-page-and-commute-deviation.md#acceptance-scenarios). Verification should exercise the public API with synthetic profiles and controlled provider fixtures, plus end-to-end coordination/access/history behavior. No new test framework is implied. Record automated versus manual checks and remaining limitations; routine suites should not require live provider credentials or real family addresses.

## Remaining external evidence limits

No authenticated live capture establishes OneMap's deployed date acceptance, timezone/arrival interpretation, schedule freshness, real-time coverage, live route equality, route quality or latency for this feature. Fixture equality and rounded totals establish none of those population/provider claims. A universal weekday/weekend equality study is not a prerequisite for the already accepted single-route product choice.

Before enabling certified comparison, the backend developer must document normalization evidence for claimed elapsed-time semantics and provider behavior. Use existing high-trust documentation plus authorized controlled nonproduction captures with public/synthetic anchors where documentation is insufficient. Never certify timing just because an itinerary contains geometry. If evidence cannot establish a guarantee, return comparison unavailable and keep supported independent route information; report a concrete product constraint for HITL review if it prevents an accepted capability.

Planning acceptance is distinct from implementation readiness and release readiness. The user explicitly accepted both linked artifacts and authorized resolution of the approval ticket. Backend source, services, PRs and deployment remain untouched by this planning package.
