# Issue #46 validation

## Automated checks

- `npm run test:unit`: 253 tests pass across 15 files (after merging issue #47).
- `npm run build`: production build succeeds. Vite reports the existing large JavaScript chunk warning.
- Commute summary presentation coverage confirms that home-only estimates expose a duration and distance without a deviation. Existing centre commute scenarios continue to verify certified workplace deviation, unavailable certification, partial legs, and numeric rounding boundaries.
- Commute session coverage confirms that the active result set is requested in each selected mode, a failed centre does not remove usable sibling estimates, endpoint authorization failure clears all personal estimates, primary-centre failure does not hide successful siblings, mismatched condition sets are marked incomparable, and profile revision/snapshot changes bind a new session context.

## Browser evidence

Used the existing intercepted API/Firebase browser harness against this worktree. Desktop (1440 x 1000), tablet (768 x 1024), and phone (390 x 844) runs rendered with no page errors. The pre-change and after-change match evidence is in `C:/Users/ZPC/AppData/Local/Temp/kcm-spec44/evidence/ranking-before.json` and `ranking-issue46.json`; both show Garden at 66% followed by River at 45%. Screenshots are `ranking-issue46.png`, `ranking-issue46-tablet.png`, and `ranking-issue46-mobile.png` in that evidence folder. The after screenshot showed each estimate beside its corresponding match facts.

An additional controlled browser journey used valid synthetic commute responses in home-only and certified workplace variants on the merged branch. Home-only showed `10 mins home to centre` with `5.0 km`; the workplace variant showed `11 min extra travel`, `Via centre 42 mins`, `Direct 30 mins`, and `Times rounded`. Both runs exercised Matches → centre details → return, and Driving/Public transport/Walking/Cycling mode controls retained Public transport across that journey with no page errors. Phone checks repeated the home-only path at 390 x 844. Reports and screenshots are `ranking-issue46-home-only-merged.json`, `ranking-issue46-certified-merged.json`, and `ranking-issue46-home-only-mobile-merged.json` in the same evidence folder.

The earlier fixture without direct-baseline certification still showed an explicit unavailable state instead of fabricating a deviation. The certified 2,520/1,800, 0/negative, under-60-second, and 2,491/1,829 boundaries remain covered by centre commute presentation tests.

No live routing provider or deployed backend capability was exercised. The browser fixture's synthetic responses establish display behavior only.
