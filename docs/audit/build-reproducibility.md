# Build reproducibility, package ownership, and documentation audit

**Audit slice:** frontend issue #15
**Frontend revision:** `64437a2afaecdec13f580b166348a53745eba132` (branch `implement/ticket-15`)
**Backend contract-evidence revision:** `db7fef7cc0e8691c83fc49623212ef35093c11d7` (sibling checkout, read-only; not an audit target)
**Working-tree state at inspection:** clean before this document was added
**Observed tools:** Node.js `v24.14.0`, npm `11.9.0`; neither version is pinned by the project.
**Inspection date:** 2026-11-06

This is a static inventory and reproducibility assessment. No dependencies were installed, no build or application service was run, and no tracked build output was generated or changed. Findings describe evidence at the revisions above; they do not claim product behavior is defective or approved.

## Package and artifact inventory

| Area | Evidence at the audited revision | Assessment |
|---|---|---|
| Root application | Root `package.json` defines `dev`, `build`, `preview`, and `start` scripts; `build` is `vite build` (`package.json:6-10`). Root `index.html` loads `/src/main.jsx` (`index.html:1`). No root `vite.config.*` is present. | The root package is the primary application. Vite defaults apply unless supplied by CLI/environment. `npm start` and `npm run dev` both start Vite on port 3000 (`package.json:6-10`). |
| Root dependencies | Root manifest uses `latest` for React, React DOM, Vite and `@vitejs/plugin-react`, and ranges for the remaining dependencies (`package.json:12-20`). The root lockfile is v3 and currently resolves React/React DOM `19.3.0`, Vite `8.3.4`, plugin-react `6.1.2`, and Firebase `13.1.0` (`package-lock.json`, root package entries). Vite and plugin-react lock entries require Node `^20.19.0 || >=22.12.0`. | `npm ci` can use the committed lockfile for a repeatable dependency tree, but a future manifest update/install can refresh `latest`; lockfile alone does not pin Node/npm. There is no `engines`, `packageManager`, `.nvmrc`, or `.node-version` pin in the root package/repository inventory. |
| Nested scaffold | `kidcare-match/package.json` is a separate package with its own `build` and `dev` scripts and React/Vite dependencies (`kidcare-match/package.json:1-23`). It has its own v3 `kidcare-match/package-lock.json` resolving Vite `8.3.4`, React/React DOM `19.3.0`, plugin-react `6.1.2`, and Node engine constraints (`kidcare-match/package-lock.json`). Its Vite config is local to the nested package (`kidcare-match/vite.config.js:1-7`). | The nested package is independently installable/buildable. No root workspace declaration or script delegates to it. Its `.gitignore` excludes its own `dist/` (`kidcare-match/.gitignore:10-12`). The relationship to active deployment is not established. |
| Tracked root build output | `git ls-files` lists `dist/index.html`, `dist/assets/index-B3K0HUyN.js`, and `dist/assets/index-DSzYRmsz.css`. Root `firebase.json` sets Hosting `public` to `dist`, ignores dotfiles and `node_modules`, and rewrites all paths to `/index.html` (`firebase.json:1-18`). | Tracked root output is in the configured hosting directory. This establishes a deployment configuration relationship, but not whether the currently tracked files are fresh, currently deployed, or generated from this exact source. No cleanup or regeneration was performed. |
| Nested output and Firebase config | No `kidcare-match/dist/` files are tracked. Root `firebase.json` names only root `dist`. | No evidence in the checked-in Firebase Hosting configuration connects the nested scaffold to deployment. Other external deployment configuration was not inspected. |
| Environment configuration | Tracked `.env.development.local` and `frontend/.env.production` contain the variable names `VITE_API_URL` and `VITE_API_BASE_URL`; values are intentionally omitted. `src/api.js:4-11` reads `VITE_API_URL`; `src/admin/adminApi.js:3-8` reads `VITE_API_BASE_URL`. `src/firebase.js:4-15` initializes Firebase from a source-defined client configuration. | Environment names and configuration ownership are inconsistent across app areas and production config location. Values and Firebase configuration are not reproduced here. A Vite build can bake client-exposed configuration into assets; generated assets must be treated as public output. |

## Findings

### F-15-01 — Root dependency manifest leaves core tool versions floating

- **Category / journey:** Build and dependencies; reproducible installation/build.
- **Classification:** Observed behavior.
- **Evidence:** Frontend revision `64437a2afaecdec13f580b166348a53745eba132`; `package.json:12-20` specifies `latest` for React, React DOM, Vite, and `@vitejs/plugin-react`. `package-lock.json` currently pins those resolved versions, but there is no Node/npm version declaration in `package.json` or root inventory.
- **Reproduction:** Inspect those manifest and lock entries; no installation was needed.
- **Impact:** Lockfile-based `npm ci` has a pinned tree at this commit, but regeneration of the lockfile can select newer major releases under `latest`; different Node/npm versions can also alter support and install behavior. A successful current install/build has not been demonstrated.
- **Severity:** Medium — future lockfile refreshes can change core build tools/framework versions without a deliberate manifest range.
- **Confidence:** High — direct manifest and lockfile evidence.
- **Status:** Open; no remediation in this baseline.

### F-15-02 — Root and nested packages have unclear source/deployment ownership

- **Category / journey:** Build, maintainability and documentation; root/nested package ownership.
- **Classification:** Observed behavior.
- **Evidence:** Root package and entrypoint are `package.json:1-20` and `index.html:1`; nested package has its own manifest, lockfile, entrypoint, source tree and Vite config (`kidcare-match/package.json`, `kidcare-match/index.html`, `kidcare-match/vite.config.js`). Root Hosting targets root `dist` (`firebase.json:1-18`), whose files are tracked; nested `dist` is ignored by its local `.gitignore` and is not tracked.
- **Reproduction:** Compare the two package manifests, local build configs, tracked output, and Firebase Hosting config.
- **Impact:** A maintainer can install/build the wrong app or mistake the nested scaffold for the configured hosted application. The available files do not prove whether another deployment pipeline uses the nested package.
- **Severity:** Medium — ambiguity can cause builds or edits to target a package that does not produce the configured Hosting output.
- **Confidence:** High for the checked-in configuration; medium for repository-wide deployment ownership because external deployment configuration was not inspected.
- **Status:** Open; ownership requires maintainer clarification/evidence.

### F-15-03 — README run instructions do not describe the available reproducible install path

- **Category / journey:** Documentation and build reproducibility.
- **Classification:** Observed behavior.
- **Evidence:** `README.md:7-10` says install Node.js LTS and run `npm install`, then `npm start` or `npm run dev`; root scripts exist (`package.json:6-10`) but Node/npm are not pinned and `npm ci` is not documented. At audit time, Node `v24.14.0` and npm `11.9.0` were present, with no root `node_modules` directory.
- **Reproduction:** Compare the README and root manifest; check the checkout for `node_modules` and tool pin files.
- **Impact:** The documented `npm install` path may update the lockfile and does not tell maintainers how to install from the committed lock deterministically. “Node.js LTS” alone does not communicate the minimum engine declared by the currently locked Vite toolchain (`^20.19.0 || >=22.12.0`).
- **Severity:** Low — setup guidance is usable but does not establish a repeatable toolchain.
- **Confidence:** High — direct document, manifest, lockfile and environment evidence.
- **Status:** Open; no documentation edits beyond this audit record.

### F-15-04 — General README describes an integration state inconsistent with current source

- **Category / journey:** Documentation accuracy; authentication, API integration and admin operations.
- **Classification:** Observed behavior.
- **Evidence:** `README.md:26-28` says the frontend does not connect to a backend or Firebase and describes replacement of sample arrays as future work. Current root source includes Firebase initialization (`src/firebase.js:1-15`), API wrappers (`src/api.js:1-100`; `src/admin/adminApi.js:1-25`), and Firebase auth/API orchestration (`src/main.jsx`). The administrator README describes protected backend operations and current admin functionality (`src/admin/ADMIN_README.md:3-11`).
- **Reproduction:** Compare the cited README statements with the current root source and administrator README.
- **Impact:** Maintainers may misunderstand which portions use Firebase/backend requests and which remain demo/local behavior. This static comparison does not establish that every integration is reachable or working.
- **Severity:** Medium — the README's blanket statement can mislead setup, security review and audit planning.
- **Confidence:** High that the documentation and source claims differ; runtime behavior remains unverified.
- **Status:** Open; product and documentation intent not changed here.

### F-15-05 — Backend API configuration has two variable names and two tracked env-file locations

- **Category / journey:** Configuration maintainability and documentation accuracy; API compatibility.
- **Classification:** Observed behavior.
- **Evidence:** `src/api.js:4-11` reads `VITE_API_URL`, while `src/admin/adminApi.js:3-8` reads `VITE_API_BASE_URL`. Both names occur in tracked `.env.development.local` and `frontend/.env.production`; only names are recorded here. `src/admin/ADMIN_README.md:18-30` documents `VITE_API_BASE_URL` for admin setup. Vite exposes `VITE_` variables to client code; values are excluded from this report.
- **Reproduction:** Inspect variable references and report only key names; do not print or copy values.
- **Impact:** A deployment can configure one base and leave the other request family unconfigured or pointed elsewhere. Tracked environment files also make config provenance/change review harder. Values and target availability were not evaluated.
- **Severity:** Medium — configuration drift can leave user and administrator requests with different behavior.
- **Confidence:** High for the two-name split; medium for actual runtime/deployment impact, which was not tested.
- **Status:** Open; no values or configuration changes made.

## Scenario and evidence register

All rows are **P2** per the approved matrix. “Static” means source/config/document inspection at frontend revision `64437a2afaecdec13f580b166348a53745eba132`; no runtime environment was used. No synthetic fixture was needed for the static checks. Sanitized evidence is this file and its cited repository paths. Outcome is **finding** where the cited mismatch/risk is recorded above, or **unverified** where a runtime/deployment claim cannot be established statically.

| Scenario | Setup/fixture provenance | Expected assessment | Layer and source | Environment/version | Evidence | Outcome |
|---|---|---|---|---|---|---|
| Root package lock/toolchain reproducibility | No fixture; manifest and committed lockfile | Determine whether root dependencies/tool versions are pinned and install/build procedure is repeatable | Static; `package.json`, `package-lock.json`, root pin-file inventory | Node `v24.14.0`, npm `11.9.0`; no install | F-15-01; this report | finding |
| Root vs nested application/build ownership | No fixture; tracked source/output/config inventory | Identify package entrypoints, build outputs and configured hosting target; flag unresolved ownership | Static; `package.json`, `index.html`, `kidcare-match/package.json`, `kidcare-match/vite.config.js`, `firebase.json`, tracked file inventory | Same checkout/revision | F-15-02; this report | finding |
| Run instructions match available commands and reproducible installation | No fixture; README and package metadata | Confirm instructions identify supported runtime and lockfile-preserving install | Static; `README.md:5-11`, `package.json:6-10`, lock metadata | Same observed Node/npm; dependencies absent | F-15-03; this report | finding |
| General README accurately describes Firebase/backend integration | No fixture; source/document claims | Compare claims with implementation presence without claiming connectivity | Static; `README.md:26-28`, `src/firebase.js`, `src/api.js`, `src/admin/adminApi.js`, `src/main.jsx` | Same checkout/revision | F-15-04; this report | finding |
| User/admin API configuration is consistently named and located | No fixture; variable names only, values withheld | Identify API-base mismatch without exposing values or sending requests | Static; `src/api.js:4-11`, `src/admin/adminApi.js:3-8`, tracked env file names, `src/admin/ADMIN_README.md:18-30` | Same checkout/revision; no service access | F-15-05; this report | finding |
| Clean install and root build | No fixture | Demonstrate `npm ci` and build in disposable output without touching tracked `dist` | `npm ci --no-audit --no-fund` followed by `npm run build -- --outDir build-output --emptyOutDir` in a curated disposable copy; no app was launched | Node `v24.14.0`, npm `11.9.0`; locked dependencies listed below | Successful install/build output; temp copy omitted env files and used synthetic non-routable API bases | pass |
| Nested package installation/build | No fixture | Determine whether nested package can build independently and whether deployment consumes it | Runtime/build verification not run | Nested Node/npm toolchain not independently pinned; no dependencies installed | Ownership static evidence in F-15-02 | unverified |
| Deployment artifact freshness and production ownership | No fixture | Establish whether tracked root `dist` matches current source and active deployment | Static evidence establishes only `firebase.json` target; no build/deploy inspection | Deployment environment not inspected | `firebase.json:1-18`, tracked root `dist/` inventory | unverified |

## Verification limitation and safe procedure

The root install/build check used a unique temporary copy containing only `package.json`, `package-lock.json`, `index.html`, and `src/`. It excluded `.env*`, `.firebaserc`, tracked `dist/`, and the nested package. `npm ci --no-audit --no-fund` completed successfully; `npm ls --depth=0` reported the lockfile versions listed above. With `VITE_API_URL` and `VITE_API_BASE_URL` set to `https://invalid.example.invalid`, `npm run build -- --outDir build-output --emptyOutDir` completed successfully under Node `v24.14.0` / npm `11.9.0`. The build emitted a Vite advisory that its minified JavaScript chunk was `821.29 kB`, above the default `500 kB` warning threshold; this is recorded as build output, not as an acceptance threshold or performance finding. The temporary copy/output was isolated from the repository and removed after the check. No application service or endpoint was contacted.

This demonstrates the root lockfile install and build only for the recorded Windows toolchain and synthetic environment. It does not prove another Node/npm/OS combination, nested package build, live service behavior, deployment ownership, or freshness of tracked `dist`. Firebase client configuration is source-defined and was present in the disposable source copy; no config values or generated asset contents were printed or retained. Runtime/service checks remain outside this slice.


For repeatability, use the same curated-copy procedure, lockfile and exact `npm ci` / build commands above. Do not run `dev`, `start`, `preview`, deploy, or request any endpoint for this verification. Any inability to establish this isolation is an explicit unverified gap, not permission to use production configuration.

## Scope check

Only this audit document is added. Application source/configuration, manifests/lockfiles, nested package, tracked `dist/`, Firebase config, and sibling backend were not modified. No issue was edited or closed.
