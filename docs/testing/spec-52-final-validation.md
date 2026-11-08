# Specification 52: final validation

The four implementation tickets (#53–#56) are integrated on `integration/spec-52` in [PR #57](https://github.com/Lolgend/kidcarematch-frontend/pull/57). The review base is `55713b44cd52ae680ad37ee6edf71bbe149f7822`.

Runtime and browser verification used `099e59b548807a30a6fff47d8d6c8a6fde670b3b`, whose tree is identical to the tested review-fix commit `cde13fde93900339317ddb440c1ee232c377c656`. Production source is unchanged from the build verified at `31aa016`.

## Automated checks

- Full Vitest suite and coverage: **289 tests across 17 files pass**. Coverage instrumentation covers the API modules configured in `vitest.config.js`; it is not a whole-application coverage claim.
- Production build passes, retaining the existing large JavaScript chunk advisory. Generated build output is not committed.
- Whitespace checks pass. The final implementation tree on the integration branch matches the tested review-fix branch before this documentation-only change.
- Tests use controlled Firebase authentication and the actual authenticated API client with synthetic, fail-closed HTTP fixtures. Debounce and race tests use virtual time and deferred responses.

The integer-conversion cases, missing matching wrapper, explanation cases, and reverted-edit regressions were observed failing before their implementations. Early coverage runs exposed interactions that navigated before sign-in/profile or onboarding-save effects settled. Both interactions now settle through asynchronous `act`, with visible waits outside it, without real-time sleeps or timeout increases. The final default unit and coverage commands both pass.

## Parent-flow coverage

| Area | Evidence |
| --- | --- |
| Sign-in and destinations | Email/Google callback-before-promise timing, restored Compare override, incomplete-profile gating, first completion, refresh, sign-out and account changes |
| Importance ratings | All three editors, neutral defaults, ties, endpoints, raw integer payloads/restoration, legacy 3/2/1 draft migration, and authoritative server profiles |
| Backend matching | Saved-profile request with `top_n: 10`, save-before-match order, backend scores/order, fees/subsidies, vacancy month, matching travel data, ten-card cap and successful empty results |
| Recovery and ordering | Failed saves and matching with Retry, outdated snapshots, overlapping writes, explicit Family profile saves, queued identity changes, superseded responses and old return controls |
| Reverted edits | No-write reversion, in-flight successful/failed writes, slow-response duplicate prevention, and pending-match recovery |
| Explanations | Summary, first-card rationale, positional/per-result highlights, blank/missing fields, duplicate avoidance, no provider claim and details return |

## Browser confirmation

Controlled Chrome **156.0.8078.80 on Windows** runs cover 1440×1000 and 390×844. Synthetic API and authentication fixtures are used; off-origin requests, including fonts and map tiles, are blocked.

All three editors support Home/End to reach 1/5 and Arrow keys to step by one. Returning to saved ratings restores the idle Refresh action. Save and matching failures retain previous results with outdated labels, and Retry recovers. Backend centre IDs survive watchlist, details and comparison actions. Comparison Back/Forward/refresh and direct centre URLs retain their destinations. Changing displayed commute mode requests commute data without recalculating backend matches.

The fixture deliberately returns **42.6% before 97.4%** to detect local sorting. It displays published fee **$1100**, estimated subsidy **$300**, and estimated payable **$800** as separate values. No page errors or horizontal document overflow were observed. Changed guidance and result details measure **6.05:1 contrast** against their white surfaces.

Local reports and captures are under `test-results/spec-52/final/`; the temporary driver is `.scratch/spec-52/browser.mjs`. These files are local evidence, not committed browser dependencies or live-service verification.

## Standards

Two findings were resolved: the introduced guidance needed stronger contrast, and an unused matching ref needed removal. Scoped 12px text styling preserves unrelated fine print. The reviewer confirmed the source fixes; browser measurements confirm the changed text clears the 4.5:1 floor.

## Spec

The saving indicator could stay pending when edits returned to saved values. Regression tests now cover that behavior before debounce, after older successful or failed writes, and during a pending match. Settlement is scoped to the active account, and the latest intended values remain authoritative. The final Family profile helper also describes the separation of displayed commute modes from matching instead of claiming obsolete postal-code scoring.

Standards: two findings resolved, including the contrast breach. Spec: two findings resolved, including the pending-saving race. Neither axis has an outstanding finding after confirmation.

## Contract and scope

The frontend assumes the separately implemented integer-rating backend contract is available. Its self-contained [handoff](../specs/importance-ratings-backend-handoff.md) preserves the existing field names and defines raw 1–5 storage plus backend normalization. Synthetic checks do not establish deployed backend, Firebase, OneMap or explanation-provider readiness. No backend implementation or database operation is included. ADR 0001's independent commute display contract is preserved.

The original checkout and its local edits remain untouched; implementation used isolated worktrees and GPT-6-Luna High agents.
