# Centre details and review editing validation (#38)

## Automated checks

- `npm run test:unit -- tests/api/reviews.test.js tests/profile/family-profile.test.js tests/profile/onboarding.test.js tests/api/accounts.test.js` — 4 files, 96 tests passed.
- `npm run build` — passed. Vite reported the existing large JavaScript chunk warning (about 1 MB).
- `git diff --check` — passed before final merge cleanup.

## Browser journeys

The isolated Puppeteer runner and report files are under `%LOCALAPPDATA%\Temp\kidcarematch-spec34\`. The app ran against synthetic API/auth fixtures; browser requests to other origins (including fonts and OneMap tiles) were blocked. No live backend, identity provider, or map provider was contacted.

- Create from an exact `404 Review not found`, edit an existing review, keep the draft after a failed save, and focus the reviews section after save: `route-parent-create-own-review-absent-1440x1000-report.json`, `route-parent-edit-existing-review-1440x1000-report.json`, `route-parent-save-failure-save-failure-1440x1000-report.json`.
- Retry a failed centre-details section while an existing review is edited, then save; cancel contextual return and retain the draft: `route-parent-centre-retry-preserves-edit-centre-review-1440x1000-report.json`, `route-parent-return-cancel-own-review-absent-1440x1000-report.json`.
- Cancel multi-entry Back, same-path traversal, and Forward while dirty; retain editor content and URL. The harness also dispatched a cancelable `beforeunload` `Event` and checked `defaultPrevented`. This checks the registered handler without triggering a real browser unload prompt: `route-parent-history-1440x1000-report.json`.
- Delay a create response while confirming departure, delay it across an account switch, and delay a details retry across confirmed departure. In each case the late response did not restore the old editor or reopen the centre: `route-parent-leave-during-save-1440x1000-report.json`, `route-parent-account-switch-during-save-1440x1000-report.json`, `route-parent-late-detail-depart-centre-delay-on-retry-1440x1000-report.json`.

These are synthetic UI journeys, not live service or real unload-dialog checks. Existing browser evidence for the return-context restoration flow is recorded in the #37 validation note.
