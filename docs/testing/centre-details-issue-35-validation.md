# Full centre page validation (#35)

## Automated checks

- `npm run test:unit`: 193 tests passed.
- `npm run build`: passed. Vite reports the existing warning for the 1 MB JavaScript bundle.
- `git diff --check`: passed.

## Synthetic browser checks

Chrome drove the local Vite app with intercepted synthetic Firebase and API fixtures. The harness blocked every off-origin request, including OneMap tiles and Google Fonts; the rendered Leaflet route, anchors, and location data were synthetic. No live provider, backend, authentication, or write request was made.

- Parent direct arrival at `/centres/3401`, refresh, Back, and Forward showed the same centre page. The page heading received focus after direct load, refresh, and Forward.
- At 1440×1000, 768×1024, and 390×844, the document width matched the viewport. The map measured 510.75px, 378.31px, and 280px tall respectively; the layout stacked at tablet and phone widths.
- A guest opening a centre in the six-centre preview saw public details, reviews, and the location map without a commute request. A guest arriving at `/centres/99999` saw the sign-in gate; the browser made no centre-detail, review, location, or commute request for that ID.
- A synthetic unknown ID returned **Centre not found**. Centre-detail, published-review, and own-review failure fixtures left independent sections available; review failures showed recovery and did not offer a duplicate create form after own-review failure.
- Browser page errors: none. Off-origin map tiles and fonts were deliberately blocked, so these checks do not validate deployed basemap delivery.

Evidence screenshots and JSON reports were generated in the local temporary harness directory `C:\Users\ZPC\AppData\Local\Temp\kidcarematch-spec34\evidence`.

## Environment limits and release hold

Direct-route refresh was verified on local Vite only. `firebase.json` contains a catch-all rewrite to `index.html`, but no deployed-host refresh check was run.

The accepted backend handover still identifies centre-ID stability and authoritative guest eligibility for centre details as unverified backend contracts. The frontend limits guest direct links to the currently loaded six-centre preview, but this client check cannot establish backend authorization. Hold release until both backend contracts are confirmed; do not expand guest access based on frontend fixtures.
