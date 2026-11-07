# Issue #46 validation

## Automated checks

- `npm run test:unit`: 248 tests pass across 15 files.
- `npm run build`: production build succeeds. Vite reports the existing large JavaScript chunk warning.
- Commute summary presentation coverage confirms that home-only estimates expose a duration and distance without a deviation. Existing centre commute scenarios continue to verify certified workplace deviation, unavailable certification, partial legs, and numeric rounding boundaries.
- Commute session coverage confirms that the active result set is requested in each selected mode, a failed centre does not remove usable sibling estimates, endpoint authorization failure clears all personal estimates, and primary-centre failure does not hide successful siblings.

## Browser evidence

Used the existing intercepted API/Firebase browser harness in `C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/ranking.mjs` against this worktree. Desktop (1440 x 1000), tablet (768 x 1024), and phone (390 x 844) runs rendered with no page errors. Each run loaded both active Top Matches commute requests. The pre-change and after-change match evidence is in `C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/evidence/ranking-before.json` and `ranking-issue46.json`; both show Garden at 66% followed by River at 45%. Screenshots are `ranking-issue46.png`, `ranking-issue46-tablet.png`, and `ranking-issue46-mobile.png` in that evidence folder.

The browser fixture includes a workplace route without the accepted direct-baseline certification fields. Top Matches consequently showed an explicit unavailable state rather than a fabricated deviation. This pass verifies request coverage, visible mode controls, responsive composition, and unchanged ordering; it does not claim a certified workplace estimate was validated in the browser. The certified 2,520/1,800, 0/negative, under-60-second and 2,491/1,829 fixtures remain covered by the shared centre commute presentation tests.

No live routing provider or deployed backend capability was exercised. The browser fixture's synthetic responses establish display behavior only.
