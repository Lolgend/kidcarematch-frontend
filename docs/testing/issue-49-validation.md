# Issue #49 validation

## Automated checks

- `npm run test:unit` — 15 files and 252 tests passed, including the account-envelope, malformed-context, clearing, and protected-query checks in `tests/centre-return-context.test.js`.
- `npm run build` — passed. Vite reported the existing large JavaScript chunk warning.
- `git diff --check` — passed.

## Browser journey

Ran the real Vite application in Puppeteer with Firebase auth and API boundaries replaced by deterministic local fixtures. At 1440×1000, the journey selected two centres, opened comparison, used Edit selection, used browser Back and Forward, opened a centre detail and returned, refreshed the selection page, and changed accounts while a selected-centre identity request was delayed.

The refresh restored the picker query and selected IDs, and issued a by-ID request for a selected centre absent from the current query result. The delayed request did not restore the prior account's context after the account switch; browser history also could not restore it. No page errors were observed. Fixture evidence validates the client flow, not deployed API or Firebase readiness.

Detailed output: `C:\Users\ZPC\AppData\Local\Temp\kcm-spec44\issue49-browser-result.json`.
