# Specification 44: final validation

All six implementation tickets (#45–#50) are integrated on `integration/spec-44` in [PR #51](https://github.com/Lolgend/kidcarematch-frontend/pull/51). Runtime code was verified at `837ade4`; its tree matches the tested review-fix commit `b406d80`.

## Checks

- The full unit suite passed: **261 tests across 15 files**. The production build passed with the existing large-chunk advisory. The identical integration/fix tree was verified before accepting those results.
- `git diff --check 69c7443...HEAD` passed.
- The fixed browser ranking fixture retains Garden at **66%**, followed by River at **45%**, with identical factor scores. An initial parallel fixture-setup timeout was followed by a successful serial run.
- Real-app browser fixtures passed chooser/comparison/details/matches journeys, keyboard selection and expansion, partial-route retry, legacy home-only estimates, and personal/guest Leaflet pins.
- The integrated scroll regression passed **700 px** restoration through Edit selection, Back/Forward, details return, and immediate refresh after delayed identity hydration. Account switching cleared the old context.
- Final captures cover 1440×1000, 768×1024 and 390×844. Phone document width equals its 390 px viewport. Two-centre and three-centre tables use 550 px and 760 px content widths inside a 360 px scroller; a 130 px row label and a 210 px centre column fit together.

Current hosted checks are available on the [PR checks page](https://github.com/Lolgend/kidcarematch-frontend/pull/51/checks).

## Standards

No documented-standard breach was found. The one heuristic finding—duplicated selected-centre identity status markup—was resolved with shared `CompareIdentityStatus` presentation and confirmed by the original reviewer.

## Spec

Both findings were resolved and confirmed: incomplete selected-sample cohorts cannot publish numeric extra travel, and picker scroll survives navigation and refresh. Compatible retained route facts remain usable; context persistence stays account-bound and contains page choices rather than private route responses.

Standards: one heuristic finding, worst duplicate status rendering, resolved. Spec: two findings, worst incomplete-cohort numeric comparison, resolved. Neither axis has an outstanding finding from this review.

## Visual and documentation handoff

The visual verdict is **ship for the two scored responsive fixes**: comparison content stays within its cells and the Area filter stays within the phone viewport. No regression from that fix batch was observed in the supplied captures. This verdict does not claim a whole-product accessibility audit.

Fresh generic GPT-6-Luna High agents executed the visual-review and documenter role contracts because this harness has no typed shipped-role selector. The incumbent palette, typography, sidebar and display rules were preserved. PRODUCT.md and DESIGN.md were already absent; the scoped extension did not introduce a new visual system. Two detector warnings concerned unchanged notification/legend styling.

## Evidence and limits

Ticket evidence is in the adjacent validation notes, including [review fixes](spec44-review-fixes.md). Local captures and reports are archived under `test-results/spec-44/`; temporary rerunnable drivers are under `%TEMP%/kcm-spec44/` (`final-capture.mjs`, `ranking.mjs`, `run-spec44-scroll.mjs`, and `issue50-browser.mjs`).

Browser API, Firebase and route data were synthetic. Off-origin calls, including map tiles and external fonts, were blocked. These checks establish frontend behavior and real Leaflet rendering, not live provider accuracy, deployed backend support or operational budgets. Existing backend capability release gates remain in force.
