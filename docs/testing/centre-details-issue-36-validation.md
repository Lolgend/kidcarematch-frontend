# Centre detail continuation validation — issue #36

## Scope

Verify that a pending `/centres/:centreId` destination survives sign-in and required family-profile setup, that profile failures remain recoverable, and that a prior account's delayed detail responses cannot reopen protected content after sign-out or an account change.

The accepted browser, onboarding-controller, and API seams were used. All browser auth and API behavior was synthetic. No backend or live provider was contacted.

## Results

| Check | Result |
| --- | --- |
| Protected direct link → sign-in → required profile → save → centre | Pass. The tab remained at `/centres/9876`; after the synthetic save succeeded, the same protected centre loaded and fetched its detail, reviews, own-review, location, and commute sections. |
| Existing ready parent, direct route, reload, Back, Forward | Pass on the 390 × 844 viewport. The centre ID stayed in the URL and the full page returned after refresh and Forward. |
| Existing admin-email role exception | Pass in a synthetic browser session using the app's established admin email exception. |
| Profile read failure and retry | Pass. A synthetic first read returned 503; the onboarding retry recovered, retained `/centres/9876`, then loaded the centre. |
| Profile save failure and retry | Pass. A synthetic first save returned 503; the setup form and `/centres/9876` remained available, and the next save resumed that centre. |
| Sign-out during outstanding centre, own-review, and commute requests | Pass. The requests were held until after sign-out, then released with the centre-detail request failing. The protected sign-in gate remained visible at the same URL; late previous-account responses did not reopen the page. The same browser scenario failed before the auth-identity invalidation was added. |
| Permitted guest preview | Pass for the fabricated first-six centre at `/centres/3401`; the guest flow completed without profile or personal-route requests. |
| Onboarding controller and route regressions | Pass: 26 tests across `tests/profile/onboarding.test.js` and `tests/centre-details-route.test.js`. Existing tests cover ownership/session changes, load/save recovery, repeated callbacks, and the ID-based route helper. |
| Production build | Pass. Vite emitted the existing >500 kB chunk-size advisory. Generated `dist/` output was restored and is not included. |

## Implementation note

The pending destination is the centre ID already present in the route. It remains independent from account and profile data, and is reauthorized by the existing route-restoration flow when onboarding reaches an allowed state. On an authenticated identity change, the page now advances its existing detail-request generation and clears centre, review, and own-review state. This keeps late section responses from the prior viewer from overwriting a sign-in/access gate or carrying private review state into the next session. Profile ownership, role checks, and guest-preview checks remain in the existing onboarding and route flow.

## Evidence limits

The browser harness lives under `%LOCALAPPDATA%\Temp\kidcarematch-spec34-issue36`; screenshots and JSON reports are also temp-only. The harness replaces Firebase and API calls with synthetic fixtures and blocks every off-origin browser request. It does not establish deployed hosting behavior, backend authorization, real profile ownership, or provider routing behavior. The onboarding controller tests cover the backend `ADMIN` role path; no production admin credentials were used.
