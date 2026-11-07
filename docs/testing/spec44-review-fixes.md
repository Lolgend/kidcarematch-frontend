# Issue 44 final review fixes: validation

## Scope

This validation covers the selected-sample comparison gate, comparison picker scroll restoration, comparison table and Area-filter responsiveness, shared selected-centre identity status, destination copy, and travel helper text. It does not establish production API or commute-provider readiness.

## Automated checks

- Full unit suite: 15 files and 261 tests passed, including the public commute-session, commute-presentation and centre-return-context seams.
- Production build passed. Vite reported the existing large JavaScript chunk warning (1,071 kB before gzip); assets are generated locally and are not committed.
- `git diff --check 69c74435e968c3144d16ad4237e50cef4ff54ee5...HEAD` is the final whitespace check, including the earlier issue 45 and stylesheet EOF changes.

## Browser journey

Run the temporary Puppeteer driver with `node C:\Users\ZPC\AppData\Local\Temp\kcm-spec44\run-spec44-scroll.mjs --repo=<repository-path>`. It accepts `--repo` or `KCM_REPO` and prints the resolved repository and branch. The harness uses synthetic Firebase/API fixtures, blocks off-origin calls, delays selected-centre identity hydration on refresh, and leaves no browser artifacts in the repository.

On `implement/spec44-review-fixes`, the driver passed Edit selection, Back, Forward, details return, and same-tab refresh with a saved 700px picker scroll. Refresh restoration completed after the directory and delayed selected-centre identity hydrated. Switching accounts did not restore the previous account's picker context. The driver reported no page errors.

At a 390px viewport, the two-centre table measured 550px wide and the three-centre table 760px wide. In each state, the sticky row label was 130px, each centre column was 210px, and one row label plus a complete centre column fit within the 360px table viewport. Centre headings rendered at 15px. The two-centre fixture had no cell content wider than its cell; both states remained horizontally scrollable.

## Limits

Browser claims above use synthetic responses. They verify frontend state restoration and rendered table geometry, not live directory data, deployed commute capabilities, external map tiles, or provider estimates.
