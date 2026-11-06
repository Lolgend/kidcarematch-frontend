# Centre details return restoration: issue #37

Validation used the issue-specific Puppeteer runner `issue37-run.mjs` from the temporary spec harness. The runner served the app locally and supplied synthetic authentication and API responses; requests to other origins were blocked. No live backend, identity provider, or user data was used.

## Browser scenarios

- Opened centre details from each supported origin: Overview, Preschool directory, Find my matches, My watchlist, and Compare centres. Same-tab refresh retained the return origin, and the return action restored the originating page and control focus.
- Changed the synthetic Matches response after opening a centre. Refresh and return restored the original candidate ID and displayed match data without running a new match search.
- Ranked two synthetic candidates with a custom travel priority and a $1,200 budget, then changed the fixture's profile budget to $1,500 before refresh. Return restored the prior $1,200 budget, custom priority, original result order, and scores. Changing vacancy priority afterward re-ranked both candidates with the existing score calculation and promoted the other centre.
- Exercised two origin chains in one tab: Overview → centre A → return → Directory filtered to River → centre B → Back → Back → centre A → return. Centre A retained Overview as its origin, while centre B retained Directory and its query.
- Opened a fresh document with copied `sessionStorage` and `history.state`, both directly and after reloading the source tab. The copied return context was invalidated before the return action; the new document returned to Directory instead of the copied Overview origin.
- Replayed an origin envelope associated with a different account. It was not restored for the current account.

All scenarios passed in the synthetic browser harness. The account test covers stale account-bound return data; live identity-provider switching was not exercised. The implementation also limits stored match restoration to candidate IDs and displayed score, fee, fit, vacancy, and location fields; it does not store profile locations or route geometry.
