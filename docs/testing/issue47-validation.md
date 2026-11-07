# Issue 47 validation: searchable centre selection

## Automated checks

- `npm run test:unit`: 246 tests passed across 15 files.
- `npm run build`: passed. Vite reported the existing large JavaScript chunk warning (about 1.05 MB before gzip).
- `tests/api/centres.test.js`: added coverage that postal-prefix parameters are serialized for the existing directory endpoint.

## Browser journey

Ran a temporary Puppeteer harness against the real Vite application on synthetic Firebase/API fixtures. At 1440 by 1000 it verified:

- all 205 fixture centres were available, including records beyond the first 100 result page;
- an empty watchlist filter returned a useful empty state while the full directory remained available after clearing the filter;
- backend-realistic name/address search and postal-prefix search worked;
- the existing district chooser filtered area IDs, and a selected centre stayed in the summary while hidden by that filter;
- a synthetic one-time directory failure showed a retry action; retry recovered without losing the selection;
- the fourth selection was disabled after choosing three;
- Compare opened the separate comparison destination and Edit selection returned with all three choices checked.

The final run recorded 110 synthetic API requests and no browser page errors. Screenshot: `C:\Users\ZPC\AppData\Local\Temp\kidcarematch-spec34\evidence\issue47-picker-1440.png`. The harness, API fixtures and browser artifact are local temporary evidence, not committed product files.

## Backend contract evidence and limits

Read the backend source at revision `a06e872`, `src/kidcarematch_backend/api/v1/centres.py` and `schemas/centre.py`. `GET /api/v1/centres` accepts case-insensitive `query` matching centre name/address, repeated numeric `district` filters for postal areas, `postal_prefix`, and `limit`/`offset`; `limit` is capped at 100 and the response includes `total`. The picker requests every page for the active search and applies the watchlist restriction to the returned directory set.

No live/deployed backend was contacted. Browser evidence uses synthetic fixtures and establishes frontend pagination/search orchestration only; production data completeness and runtime backend compatibility remain unverified.
