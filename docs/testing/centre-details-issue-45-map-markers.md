# Centre details issue 45: map marker validation

## Change

Map pins now use one shared Leaflet `DivIcon` presentation for Home, Work and Centre. Each pin contains an inline SVG glyph, visible text label and accessible name. Both the personal commute map and the centre-only guest map use the shared component. Runtime diagnosis on the unchanged baseline found working development marker PNGs (natural width 25), but production markers requested a relative `marker-icon.png` and had natural width zero. The production CSS inlines Leaflet's default icon-path image; Leaflet's directory detection expects a URL ending in `marker-icon.png`, so it cannot recover the directory from that data URL. Inline SVG removes this runtime asset-path dependency. The isolated baseline reports are `%TEMP%/kcm-spec44/marker-baseline-diagnosis.json` and `marker-baseline-production-diagnosis.json`.

## Verification

- `npm run test:unit`: 15 files, 244 tests passed.
- `npm run build`: passed. A production preview rendered the guest Centre marker from the generated bundle with no browser page errors.
- Real Leaflet browser captures used deterministic synthetic API/Firebase responses. Personal maps were checked at 1440x1000, 768x1024 and 390x844; guest maps at 1440x1000 and 390x844. Personal maps showed Home, Centre and Work; guest maps showed Centre. Reports recorded visible marker bounds and accessible names. Stable copies of all reports and screenshots are under `C:\Users\ZPC\AppData\Local\Temp\kcm-spec44\issue45-evidence\`, including the production preview report.

The browser harness blocks off-origin requests, including OneMap tiles and Google Fonts. These captures verify real Leaflet marker, control and route rendering against the app's map surface; they do not verify live tile delivery or live commute-provider behavior. Synthetic route geometry, real Leaflet controls, existing map fitting and textual journey content remained present.
