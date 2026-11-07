# Issue #50 validation: comparison travel estimates

## Implementation boundaries

The comparison destination owns one `useCommuteSession` over the full selected ID list while that destination is visible. It uses the saved family profile context, account identity, and retained session mode. Each selected centre summary comes from `setData` and the same `comparisonCompatible` / `comparisonSetComplete` flags. The specification table receives row-ready shared summaries; it does not calculate or certify routes.

The row uses the existing summary, mode selector, and duration/distance formatters from `CentreCommute`. Existing capability negotiation, direct-baseline certification, selected-sampling/fallback, shared expiry, and stale request rejection remain in the commute-session controller. The matching score and order are unchanged.

Shared summary fixes in this slice:

- A configured workplace is not called unresolved while route data is still loading.
- Missing legacy conditions/evaluation metadata is described as unverifiable, not as a known conditions mismatch.
- A complete home-to-centre route remains visible when peer data is missing or conditions cannot be verified, with an explicit individual/non-comparable qualification.
- Retryable reasons from via legs, the direct route, the sample, or its comparison keep Retry available after HTTP 200 partial responses. Independently usable direct-route facts remain visible.
- A recoverable commute authorization failure in comparison offers the same sign-in action as the other commute surfaces.

## Automated checks

Commands run from the issue-50 worktree:

```powershell
npm run test:unit -- --run tests/commute/centre-commute.test.js
npm run test:unit
npm run build
```

The focused commute presentation suite passed with 41 tests. The full unit suite passed with 258 tests across 15 files, including the existing 49 commute-session controller scenarios for capability fallback, expiry, and reordered requests. The production build completed successfully. Vite reported its existing advisory that the generated JavaScript chunk is larger than 500 kB.

The existing public presentation/controller seams cover certified rounding examples. The 2,520-second via / 1,800-second direct case renders 12 minutes; 2,491 / 1,829 renders 11 minutes. Existing assertions also retain separate total rounding, under-one-minute, zero/negative, and unavailable cases. A new presentation case covers a retryable HTTP 200 via-leg timeout with a usable direct route and verifies that the direct duration and Retry action remain available.

## Real browser journey

Browser checks used deterministic synthetic profiles, centres, and commute responses. Firebase and API boundaries were intercepted; off-origin requests were aborted. Browser assertions included:

- Three-centre chooser to comparison at 1440×1000, 768×1024, and 390×844.
- Certified workplace estimate for 2,520 / 1,800 seconds, shared mode changes across comparison → centre details → matches, and the mode retained when returning from details.
- Delayed initial workplace loading without a false saved-workplace resolution error.
- HTTP 200 direct-baseline timeout and HTTP 200 retryable via-leg timeout, with Retry recovery in the comparison row.
- Default-off legacy home-only routes with condition/evaluation metadata omitted. Home-to-centre duration remained visible with a “comparison conditions unavailable” qualification; it was never described as comparable.
- Phone horizontal scrolling and vertical table scrolling. At 390×844 the table scroll position reached the lower Contact row while the centre header remained sticky at the table top; row labels remained sticky horizontally.
- Desktop, tablet, and phone table widths; the table's content overflow stayed within its horizontal scroller.
- No browser page errors. Off-origin requests were blocked in every browser run.

The browser fixtures verify client response handling and presentation only. They do not establish live routing-provider accuracy, deployment capability support, or provider timing budgets.

The rerunnable capture harness accepts `--repo` or `KCM_REPO` and is saved at:

`C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/issue50-browser.mjs`

Example:

```powershell
node C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/issue50-browser.mjs --repo="C:/path/to/repository" --parent --baseline --port=3250
node C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/issue50-browser.mjs --repo="C:/path/to/repository" --parent --legacy-home --port=3250
node C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/issue50-browser.mjs --repo="C:/path/to/repository" --parent --baseline --failure=via --port=3250
node C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/issue50-browser.mjs --repo="C:/path/to/repository" --parent --baseline --failure=direct --port=3250
```

The browser artifacts and JSON request/capture reports are preserved under `C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/evidence/issue50-*`. The reports include viewport and table measurements, the sticky-header result, page errors, intercepted request counts, and blocked off-origin request counts. Root can rerun the harness against the integrated checkout for final captures.
