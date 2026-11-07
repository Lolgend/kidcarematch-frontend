# Backend handoff: independent importance ratings

Status: The complete design, integer-rating contract, existing field names, and backend normalization boundary are confirmed. This document is a handoff; no backend implementation has been performed.

Frontend implementation specification: [GitHub issue #52](https://github.com/Lolgend/kidcarematch-frontend/issues/52).

## Agreed product behavior

Families independently rate Vacancy fit, Cost fit, and Travel fit using integer sliders from 1 (least important) to 5 (most important). Ties are valid. New profiles default to 3/3/3. Preserve the actual chosen integers so they remain the same across devices.

An effective matching weight is the factor's rating divided by the sum of all three ratings. For example, 5/5/1 yields weights 5/11, 5/11, and 1/11. Effective weights affect scoring; the original ratings must remain unchanged in profile responses.

## Agreed API and storage changes

Retain the current profile field names, but change their meaning and validation to raw importance ratings:

| Profile field | Type and range | Default |
| --- | --- | --- |
| `vacancy_weight` | Integer, 1 through 5 inclusive | 3 |
| `cost_weight` | Integer, 1 through 5 inclusive | 3 |
| `travel_weight` | Integer, 1 through 5 inclusive | 3 |

Update profile create, update, and read contracts and persistence together. Remove the current sum-to-one validation from raw rating fields; three raw ratings sum to between 3 and 15. Defaults are 3 for each factor. Reject out-of-range values and noninteger ratings. Do not store normalized proportions in these fields.

For example, a profile request and its corresponding response preserve:

```json
{
  "vacancy_weight": 5,
  "cost_weight": 5,
  "travel_weight": 1
}
```

Retaining the existing field names is confirmed: these `*_weight` fields represent raw importance ratings, while effective weights are derived internally. Their meaning changes from the inspected 0–1 contract; keeping the names does not make the old normalized payloads compatible.

## Agreed matching boundary

The frontend calls `POST /api/v1/centres/match` with the saved profile ID and `top_n: 10`. It saves changed ratings successfully before requesting matches. Profile-linked matching must load the raw saved ratings and derive normalized weights once for scoring and explanation inputs. Do not divide raw ratings by 100, require their sum to equal 1, or normalize a second time later in scoring.

Apply the same rating interpretation to inline matching criteria if that request mode remains supported, even though this frontend flow uses a saved profile ID.

Keep the existing match response shape and backend result order. The frontend consumes `overall_fit_score`, component scores, fee and travel breakdowns, and optional `explanation` with `summary_narrative`, `top_centre_rationale`, and positional `candidate_highlights`. Per-result `highlight` remains usable. Explanations must describe the effective weights used for the actual scores.

Frontend explanation heading: "Why these matches". The frontend does not claim Gemini authorship because the current response cannot distinguish Gemini output from deterministic fallback text. Missing or blank explanations are omitted.

Matching travel semantics remain separate from the selectable centre-detail commute display contract, preserving frontend ADR 0001. No change to the commute display endpoint is requested here.

## Reset and rollout

The user plans to purge the database separately. No purge has been performed or authorized for this frontend task. Resetting data alone does not change API validation, defaults, storage types, or scoring interpretation; those backend changes must ship together.

The eventual frontend implementation will assume the integer contract is already available, as explicitly requested by the user. It will not reconstruct 1–5 values from the old 0–1 API proportions. Browser drafts can survive a database reset: the frontend must still require setup if the server profile collection is empty. The approved legacy priority conversion, where needed for surviving preferences, maps former first/second/third factors to 3/2/1.

## Backend acceptance examples

- A profile saved as 1/1/1 returns 1/1/1; a profile saved as 5/5/5 returns 5/5/5. Both use equal effective weights for matching.
- Saving and reloading 5/5/1 preserves those exact integers and uses effective weights 5/11, 5/11, and 1/11.
- Saving 3/3/3 is valid even though the raw ratings sum to 9.
- Values below 1, above 5, and noninteger values fail validation.
- After a successful profile update, matching with only that profile ID uses the newly saved ratings.
- Scores and explanation narratives use the same effective weights; backend ordering is authoritative.
- Missing Gemini configuration or explanation failures retain the existing backend fallback policy. The frontend can display available text without provider attribution.
