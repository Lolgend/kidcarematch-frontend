# Issue 48 validation: profile-relevant comparison table

## Automated checks

- `npm run test:unit`: 255 tests passed across 15 files on the combined #46/#48/#49 integration tip.
- `npm run build`: passed. Vite reported the existing large JavaScript chunk warning (about 1.06 MB before gzip).

## Browser journey

Ran a temporary Puppeteer harness against the real Vite application with synthetic Firebase and API fixtures. The picker-to-comparison journey checked:

- three distinct centre columns and a two-column state after removing a centre;
- fees matched to all three saved profile fields (level, care type, citizenship), with exact matches shown before subsidy, a matching record with a blank amount called out as unknown, and unrelated published options behind keyboard-operable disclosures;
- vacancies matched to exact child level and enrolment month; `No immediate vacancy` stayed unavailable, unrecognized `Under review` stayed unknown, and other months/levels appeared only in the expanded options;
- an explicit zero fee remained `$0.00`, while blank fee values did not become zero; care-service records still appeared when fee values were blank;
- one delayed centre detail showed its own loading state while sibling columns remained usable; its synthetic 503 was isolated and recovered through that centre's Retry action;
- editing the family profile's care type, citizenship and enrolment month updated the fee and vacancy rows;
- long names and addresses, expanded options and visible centre/row identification at 1440 by 1000, 768 by 1024 and 390 by 844; at phone width, the table remained horizontally scrollable and the row label stayed sticky.

The browser run had no page errors. Screenshots: `C:\Users\ZPC\AppData\Local\Temp\kcm-spec44\evidence\issue48-desktop.png` and `C:\Users\ZPC\AppData\Local\Temp\kcm-spec44\evidence\issue48-phone.png`. The harness and fixtures remain temporary and are not product files.

## Evidence limits

The browser used synthetic API responses; it establishes the frontend's table matching, independent error recovery, profile updates and responsive rendering. No deployed backend was contacted, so live record completeness and runtime compatibility remain unverified.
