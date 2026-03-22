# Snapshot: XgenM Test Suite Bootstrap

**Time**: 2026-03-21 23:12 +0700
**Context**: Plan for setting up Vitest-based test suite, centralized test folders, and first verification test

---
type: plan
project: XgenM
task_id: "#xgenm-test-suite-bootstrap-2026-03-21"
status: active
tags: [plan, blueprint, testing, vitest]
related_files: [projects/XgenM/project_map.md, projects/XgenM/package.json, projects/XgenM/src/shared/url.ts, projects/XgenM/src/shared/text.ts, projects/XgenM/src/popup/App.tsx]
---

## Objective
- Set up a robust but low-verbosity testing stack for XgenM based on Vitest.
- Centralize test files in a single test surface so the repo is easy to navigate and maintain.
- Add one deterministic test that proves the test suite executes correctly end-to-end.

## Scope
- In Scope:
  - Add Vitest as the main runner.
  - Add jsdom and React Testing Library for popup/component tests.
  - Define a single canonical `tests/` folder layout for unit, component, and smoke tests.
  - Add shared test setup utilities, including thin Chrome API mocks.
  - Add at least one passing deterministic test that validates the suite is wired correctly.
  - Update package scripts for test, test:watch, and optional coverage.
- Out of Scope:
  - Full live end-to-end automation against TikTok, Facebook, and X.
  - Large Playwright suites that hit third-party DOM in CI.
  - Refactoring large runtime flows inside `src/background/job-runner.ts` beyond minimal extraction needed to make deterministic tests practical.

## Recommended Stack
- Main runner: Vitest
- DOM environment: jsdom
- UI/component tests: @testing-library/react and @testing-library/jest-dom
- Mocking: Vitest built-in mocks + local Chrome mock helpers
- Optional smoke layer: Playwright later, only after the deterministic Vitest layer is green

## Folder Strategy
- Canonical test root: `tests/`
- Suggested layout:
  - `tests/setup/`
  - `tests/mocks/`
  - `tests/unit/`
  - `tests/component/`
  - `tests/smoke/`
- Keep tests out of scattered source folders so the suite stays easy to scan and maintain.

## Phase 1: Test Foundation
- Deliverables:
  - Install Vitest, jsdom, React Testing Library, jest-dom, and coverage support.
  - Add `vitest.config.ts`.
  - Add shared setup file under `tests/setup/`.
  - Add scripts in `package.json` for `test`, `test:watch`, and `test:coverage`.
- Exit Criteria:
  - `npm run test` boots the runner successfully.
  - `npm run build` still passes after test stack installation.
  - The suite resolves path aliases used in app code.
- Critical Test Cases per Phase:
  - Runner starts without config or import errors.
  - jsdom environment loads successfully for React tests.
  - Shared alias imports such as `@shared/*` resolve in test execution.

## Phase 2: Centralized Test Harness
- Deliverables:
  - Create `tests/` tree with clear separation for setup, mocks, unit, component, and smoke.
  - Add thin Chrome extension mocks to support popup/background-oriented tests.
  - Add shared test helpers for message listeners and tab query behavior.
- Exit Criteria:
  - Popup-oriented tests can run without real Chrome APIs.
  - No test file needs to redefine full Chrome mocks ad hoc.
- Critical Test Cases per Phase:
  - Mocked `chrome.runtime.sendMessage` can be asserted from a test.
  - Mocked `chrome.tabs.query` can drive popup auto-detect behavior deterministically.
  - Test setup is imported automatically instead of repeated per file.

## Phase 3: First Deterministic Green Test
- Deliverables:
  - Add a first working test in the centralized `tests/` folder.
  - Prefer deterministic shared logic first, for example `src/shared/url.ts` or `src/shared/text.ts`.
  - Keep the first test intentionally small and stable.
- Exit Criteria:
  - At least one real test passes through `npm run test`.
  - The test proves both TypeScript imports and Vitest assertion runtime are wired correctly.
- Critical Test Cases per Phase:
  - `detectPlatform()` returns `tiktok` for TikTok URLs.
  - `detectPlatform()` returns `facebook` for Facebook Reel URLs.
  - Unsupported URLs return `null`.

## Phase 4: Popup Verification Slice
- Deliverables:
  - Add one component-level popup test for [projects/XgenM/src/popup/App.tsx](projects/XgenM/src/popup/App.tsx).
  - Validate one high-signal operator behavior using Chrome mocks.
- Exit Criteria:
  - React Testing Library can render popup state without runtime crashes.
  - One operator-facing behavior is verified with deterministic mocks.
- Critical Test Cases per Phase:
  - Active tab URL auto-populates when it is TikTok or Facebook Reel.
  - Run button remains disabled when no source URL exists.
  - Existing job state from `GET_JOB_STATE` renders a visible status badge.

## Phase 5: Hard Gate and Extension-Specific Safety
- Deliverables:
  - Define the default verification flow for future implementation work.
  - Keep Playwright optional and scoped to later smoke coverage only.
  - Document what not to test live by default.
- Exit Criteria:
  - Hard gate is explicit and repeatable.
  - Team has a clear boundary between deterministic tests and flaky third-party browser truth.
- Critical Test Cases per Phase:
  - `npm run build` passes after test files and config are added.
  - `npm run test` passes with the seeded deterministic suite.
  - If coverage is enabled, it runs without breaking the main developer loop.

## Risks and Countermeasures
- Risk: Chrome extension APIs are awkward in Node/jsdom.
  - Countermeasure: keep mocks thin and centralized under `tests/mocks/`.
- Risk: Popup tests become brittle if they depend on styling or implementation detail.
  - Countermeasure: assert behavior and visible state only.
- Risk: Team overreaches into live Playwright E2E too early.
  - Countermeasure: gate Playwright to a later smoke-only phase after Vitest coverage is green.
- Risk: `src/background/job-runner.ts` stays hard to test because it mixes orchestration and logic.
  - Countermeasure: begin by testing deterministic helpers first; only extract logic seams when there is a clear testing payoff.

## Rollback Strategy
- Trigger rollback if test tooling breaks the existing build or significantly slows the local loop.
- Rollback steps:
  - Remove newly added test scripts from `package.json`.
  - Remove Vitest config and test-only dependencies.
  - Revert new `tests/` directory if needed.
- Safe point:
  - The existing production build already passes with no test stack, so rollback is operationally simple.

## Verification Strategy
- Hard Gate for implementation after this plan:
  - Build: `npm run build`
  - Test: `npm run test`
  - Optional dev loop: `npm run test:watch`
  - Optional confidence layer: `npm run test:coverage`
- Success evidence:
  - One deterministic unit test passes.
  - One popup/component test passes.
  - Existing extension build remains green.

## Initial File Targets
- `projects/XgenM/package.json`
- `projects/XgenM/vitest.config.ts`
- `projects/XgenM/tests/setup/`
- `projects/XgenM/tests/mocks/`
- `projects/XgenM/tests/unit/`
- `projects/XgenM/tests/component/`
- `projects/XgenM/src/shared/url.ts`
- `projects/XgenM/src/shared/text.ts`
- `projects/XgenM/src/popup/App.tsx`

## Recommended First Seed Test
- File target: `tests/unit/shared/url.test.ts`
- Why first:
  - deterministic
  - low mock burden
  - validates alias resolution and assertion runtime
  - proves the suite works before touching more brittle popup or browser logic

## Recommended Handoff
- After approval, execute with an implementation pass that adds the test stack, centralizes the `tests/` folder, seeds `url.test.ts`, and verifies with `npm run build` plus `npm run test`.

## Tags
`plan` `testing` `vitest` `xgenm` `centralized-tests`

## Execution Update
- Time: 2026-03-21 23:49 +0700
- Phase 1 Status: DONE
- Commit: `65cde78` `test(xgenm): bootstrap vitest foundation for phase 1`
- Result:
  - Installed `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@vitest/coverage-v8`
  - Added `vitest.config.ts`, `eslint.config.mjs`, `tests/setup/vitest.setup.ts`, and shared Chrome mock helper
  - Seeded deterministic test coverage at `tests/unit/shared/url.test.ts`
  - Added package scripts: `lint`, `test`, `test:watch`, `test:coverage`
  - Hard gate passed with `npm run build && npm run lint && npm run test`
  - Lint scope is intentionally constrained to the Phase 1 bootstrap surface because legacy lint debt already exists in unrelated runtime files


## Execution Update
- Time: 2026-03-22 00:04 +0700
- Phase 2 Status: DONE
- Phase 3 Status: DONE
- Phase 4 Status: DONE
- Commit: \ \
- Result:
  - Expanded \ into a reusable Chrome extension harness with controllable \, \, and runtime message broadcasts.
  - Updated \ to provide jsdom \ coverage and automatic React Testing Library cleanup between specs.
  - Added popup component coverage at \ for disabled-start guard, active-tab URL auto-population, \ dispatch, and recovered/background job-state rendering.
  - Hard gate passed with \.

## Execution Update
- Time: 2026-03-22 00:04 +0700
- Phase 2 Status: DONE
- Phase 3 Status: DONE
- Phase 4 Status: DONE
- Commit: 4b72a32 test(xgenm): add phase 2-4 popup harness #xgenm-test-suite-bootstrap-2026-03-21
- Result:
  - Expanded tests/mocks/chrome.ts into a reusable Chrome extension harness with controllable tabs.query, GET_JOB_STATE, and runtime message broadcasts.
  - Updated tests/setup/vitest.setup.ts to provide jsdom scrollIntoView coverage and automatic React Testing Library cleanup between specs.
  - Added popup component coverage at tests/component/popup/App.test.tsx for disabled-start guard, active-tab URL auto-population, START_JOB dispatch, and recovered/background job-state rendering.
  - Hard gate passed with npm run build && npm run lint && npm run test.
