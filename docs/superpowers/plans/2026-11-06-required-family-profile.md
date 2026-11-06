# Required Family Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a successfully saved family profile before new or returning parents enter the signed-in app.

**Architecture:** Extract profile validation/conversion and asynchronous onboarding orchestration from `src/main.jsx`; keep the existing profile form and Firebase providers. Server profile data determines completion; local storage preserves drafts only. This plan can ship independently of the map.

**Tech Stack:** React, Firebase Authentication, existing profile API, Vitest.

**Spec:** [Accepted design](../specs/2026-11-06-centre-commute-profile-design.md), especially Required family-profile flow.

## Global Constraints

- Email/password profile setup follows verification and sign-in; Google enters profile checking after authentication.
- New and returning parents must complete the required family fields; existing defaults may count.
- OneMap lookup must not block profile completion.
- Preserve multiple named backend profiles, the existing loaded-profile selection, and administrator access.
- Require successful server persistence. Preserve entered values after failures; signout remains available.
- Do not change matching/ranking algorithms or globally gate existing API endpoints.

## Review Focus

- A delayed response for account A must not change account B's eligibility; Task 2 tests session cancellation.
- An unverified restored Firebase session must not briefly reveal parent navigation; Task 2 tests verification before loading.
- An unrelated watchlist failure must not prevent profile eligibility checks; Task 3 separates those flows and tests the integration in a browser.
- A local draft must not override an empty server list or failed load; Tasks 1–2 test server authority.
- Existing frontend weight conversion conflicts with backend's three-weight sum invariant; Task 1 tests schema-compatible round trips.

---

### Task 1: Define completion and schema-compatible profile conversion

**Files:** Create `src/profile/familyProfile.js`, `tests/profile/family-profile.test.js`; modify profile helpers/imports in `src/main.jsx`.

**Interfaces:** Export `validateFamilyProfile(form): string[]`, `toApiProfile(form, profileName = 'My family profile'): object`, `fromApiProfile(apiProfile, localDraft): object`, and `isProfileComplete(form): boolean`. Use the current frontend form keys and existing backend schema fields.

- [ ] Write failing Vitest cases: valid defaulted form succeeds; malformed home/workplace, missing WORKPLACE/EITHER workplace, missing required selections, malformed enrolment month and nonpositive budget fail. Blank optional income/members map to compatible 0/1 defaults. No test calls OneMap.
- [ ] Assert `{vacancy:50,cost:35,travel:15}` serialises to `vacancy_weight:0.5`, `cost_weight:0.35`, `travel_weight:0.15`; all three sum to 1. Preserve existing profile name/ID when updating, rather than renaming named profiles. Round-trip backend weights when no local draft exists; retain matching priorities without changing ranking code.
- [ ] Run `npm run test:unit -- tests/profile/family-profile.test.js`; expect missing exports/assertion failures before implementation.
- [ ] Extract helpers and supply all three backend weights. Use `toApiProfile`'s profileName parameter to preserve a loaded name; retain the name alongside the loaded profile ID. Replace the weaker completion helper with the shared validation result.
- [ ] Rerun the targeted tests; expect PASS. Commit only task-owned files with `refactor: centralise family profile validation and conversion`.

### Task 2: Make persistence and authentication eligibility explicit

**Files:** Create `src/profile/onboarding.js`, `tests/profile/onboarding.test.js`.

**Interfaces:** Export `createOnboardingController({loadAccount, loadProfiles, createProfile, updateProfile, writeDraft, onState}): {start(user): Promise<void>, save(form): Promise<void>, cancel(): void}`. States are `guest`, `verification-required`, `loading`, `required`, `saving`, `error`, `ready`, `admin`; state includes profile/profileId/profileName/draft/error where relevant. An injected `loadAccount` wraps existing account provisioning and returns its role. Use Task 1's conversion/validation.

- [ ] Write failing tests with injected promises: empty server list -> required; valid server profile -> ready; rejected list -> error; complete local draft alone -> required; rejected save retains form and never emits ready; successful create/update -> ready with server ID and preserved profile name. Invalid forms never call the API.
- [ ] Test unverified password/restored sessions never load parent data; verified Google/password users load once; administrator accounts bypass parent-profile loading. Cancel/signout/account switch makes old load/save resolutions inert. Capture each session's UID, never a mutable global UID for draft writes.
- [ ] Run `npm run test:unit -- tests/profile/onboarding.test.js`; expect FAIL before implementation.
- [ ] Implement the controller with a session-generation guard. Keep failed loads distinct from absent profiles. A successful save uses the server response as authority and applies the same validator; a saved browser draft alone cannot emit ready.
- [ ] Rerun both profile test files; expect PASS. Commit with `feat: require persisted profiles for parent onboarding`.

### Task 3: Connect the gate to the existing app

**Files:** Modify `src/main.jsx`, `src/styles.css`; reuse existing profile API wrappers. Do not alter `src/admin/AdminDashboard.jsx` unless a concrete integration defect requires it.

**Interfaces:** App consumes Task 2 state/controller. Parent navigation, centre/review overlays and matching are accessible only in ready; required/error/saving states show profile setup or recovery. Signed-out users keep their existing guest experience.

- [ ] Extend controller tests to cover duplicate auth callbacks during registration without duplicate creation/saves. Run the tests first; use a mocked account/profile API, without Firebase network calls.
- [ ] Replace `loadFamilyProfile` and local-only save completion with the controller. Separate watchlist loading from eligibility. Handle verification in the shared auth callback, and guard transient registration sessions. Keep signout accessible; dismiss protected overlays when leaving ready. Route a successful first save to Find my matches.
- [ ] Render profile-loading/error/retry states before protected parent content; preserve the current form and optional fields. Ensure administrator navigation remains available under its existing authorization flow.
- [ ] Run `npm run test:unit` and `npm run build`; expect both exit 0. In a browser, verify email signup/verification, Google signup, returning incomplete/complete parents, load/save failure, signout and admin entry; inspect mobile and keyboard navigation. Force a watchlist 503 for a parent with a valid server profile and assert parent navigation still becomes ready. Record the checks actually performed.
- [ ] Commit with `feat: enforce family profile completion in parent flows`.

## Handoff

Implementation has not started. Execute this plan independently of the map plan, or complete it first when implementing both. Read the accepted design and repository instructions before code changes; do not include unrelated untracked documentation in task commits.
