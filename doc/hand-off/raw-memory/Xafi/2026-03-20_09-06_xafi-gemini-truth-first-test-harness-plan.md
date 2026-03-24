# Snapshot: Xafi Gemini Truth-First Test Harness Blueprint

**Time**: 2026-03-20 09:06 +0700
**Context**: truth-first testing before Gemini refactor after rollback

---
type: plan
project: Xafi
task_id: "#plan-xafi-gemini-truth-first-test-harness-2026-03-20"
status: superseded
tags: [plan, blueprint, Xafi, gemini, testing, truth-first, superseded]
related_files:
  - /Users/non/dev/opilot/projects/Xafi/content_ai.js
  - /Users/non/dev/opilot/projects/Xafi/background.js
  - /Users/non/dev/opilot/projects/Xafi/package.json
  - /Users/non/dev/opilot/ψ/memory/logs/Xafi/2026-03-20_08-21_xafi-gemini-rollback-cascading-error.md
  - /Users/non/dev/opilot/ψ/memory/retrospectives/2026-03/20/08.39_xafi-gemini-rollback-session-close.md
  - /Users/non/dev/opilot/ψ/memory/learnings/2026-03-19_xafi-ai-browser-sequence-and-storage-map.md
---

## Objective
- Establish a truth-first testing workflow for the Gemini-specific path in Xafi before any new implementation work.
- Prove what the current rollback baseline actually does in the codebase and browser flow, instead of assuming intended behavior from past sessions.
- Create a narrow, fast, low-verbosity test surface that protects final-answer detection without slowing the content-create workflow that feeds X posting.

## Plan Status
- **Superseded by**: `/Users/non/dev/opilot/ψ/memory/logs/Xafi/2026-03-20_10-49_xafi-gemini-runtime-wiring-v2-plan.md`
- **Why superseded**:
  - This blueprint correctly produced the test harness, characterization net, seam extraction, and module-layer Gemini fix.
  - But its original Phase 5 assumption is no longer sufficient after grounding the runtime path: the extension still executes `content_ai.js` inline logic and does not yet consume the Phase 4 fix from `lib/`.
  - Therefore a new plan is required to bridge module truth into runtime truth before browser smoke can answer the real user question.
- **What remains valid from this plan**:
  - Phase 1-2 evidence
  - Phase 3 seam extraction
  - Phase 4 fixed Gemini selection semantics in module/test layer
  - Regression net and snapshots as canonical reference

## Scope
- In Scope:
  - Gemini-specific path inside `content_ai.js` only.
  - Test harness design for prompt fill, send start, response-node selection, final-answer stability, and response sanitization.
  - Baseline behavior capture on the current rolled-back codebase.
  - Evidence logging via `/sss` after each test-oriented `ggg` phase.
  - Safe seam extraction plan only after baseline truth is captured.
- Out of Scope:
  - Refactoring `background.js` message contract.
  - Grok-path refactor in the same cycle.
  - Public release hardening or broad extension-wide E2E coverage.
  - Changing user-visible workflow before baseline evidence exists.

## Ground Truth
- Current Xafi status is rolled back to the pre-Gemini-refactor baseline after cascading non-final-text selection errors.
- `content_ai.js` is structurally fragile because it combines provider selection, DOM heuristics, prompt fill, send detection, response extraction, sanitization, and completion detection in one file.
- There is no existing automated test suite in the project, and `package.json` currently exposes only `build:dist`.
- The planning constraint is explicit: test current reality first, collect evidence, then implement in guarded phases.
- Evidence gap: Xafi has no `project_map.md`, so this blueprint relies on code evidence, Oracle search insight, rollback retrospective, and current source reads.

## Strategy
- Use a two-layer testing approach:
  - Layer 1: `Vitest + jsdom` for fast deterministic tests around fixtures, text extraction, node locking semantics, and workflow-state transitions.
  - Layer 2: minimal `Playwright` smoke coverage for one or two Gemini browser-path checks only after the narrow harness is in place.
- Keep the existing background/content-script message contract frozen during the test-first phases.
- Optimize for confidence-per-minute, not coverage-percentage.
- Prefer fixture DOM and replayed states over live Gemini as the default test source.

## Phases

### Phase 1: Test Surface Grounding and Harness Bootstrap ✅ DONE (c014a3d)
- Deliverables:
  - Add minimal test toolchain to Xafi with scripts for `test:unit` and `test:smoke`.
  - Define a Gemini-only test folder structure that does not touch production behavior.
  - Document the initial test seam candidates in the snapshot/evidence file.
- Exit Criteria:
  - Test command runs locally from the current codebase.
  - Empty or placeholder smoke harness boots without production code changes.
  - No runtime behavior changes in the extension yet.
- Critical Test Cases:
  - Test runner boots in the Xafi project without breaking `build:dist`.
  - jsdom fixture can load representative Gemini-like DOM fragments.
  - Smoke harness can launch Chromium with the extension loaded or, if blocked, the blocker is explicitly captured.

### Phase 2: Baseline Truth Capture on Current Rolled-Back Code ✅ DONE (c014a3d)
- Deliverables:
  - Freeze the current Gemini baseline and write fixture tests that reproduce observed candidate-selection conditions from the existing code.
  - Create targeted test cases around current functions/behavior for:
    - prompt echo
    - non-final intermediate block winning selection
    - tool/status text noise
    - stable-but-wrong text
    - send-start false positives
  - Run the harness against the unmodified current codebase.
  - Record `/sss` evidence for what passes, fails, and remains untestable.
- Exit Criteria:
  - At least one deterministic failing or risky baseline case is reproduced in tests, or a precise evidence note explains why not yet.
  - Evidence clearly distinguishes:
    - current behavior
    - intended behavior
    - unknown behavior
  - No implementation refactor has started yet.
- Critical Test Cases:
  - Current extractor returns the wrong candidate when an intermediate Gemini block outranks the final one.
  - Current sanitization drops tool/status lines but may still return a non-final clean block.
  - Current send-start logic can mark success from input-clear/stop-button heuristics even if the round is not semantically confirmed.

### Phase 3: Safe Seam Extraction for Refactor Readiness ✅ DONE (d8ef3f8)
- Deliverables:
  - Extract testable pure or near-pure helpers behind stable interfaces without changing the external background contract.
  - Introduce explicit modules or internal sections for:
    - composer adapter
    - response candidate collector/locker
    - sanitizer/normalizer
    - workflow state transition rules
  - Backfill tests so extracted seams preserve baseline behavior where desired and isolate known bad behavior where not desired.
- Exit Criteria:
  - New seams exist and are covered by focused tests.
  - `content_ai.js` can delegate to isolated helpers without changing message types or extension-level orchestration.
  - Regression net exists for all known baseline failure classes discovered in Phase 2.
- Critical Test Cases:
  - Extracted sanitizer behavior is stable across existing noisy response blocks.
  - Candidate-locking logic can be tested with fixture DOM independent of live Gemini.
  - Prompt-fill verification logic preserves current successful cases for contenteditable and textarea paths.

### Phase 4: Gemini Workflow Implementation Under Test Guard ✅ DONE (d8ef3f8)
- Deliverables:
  - Implement the new Gemini-only workflow path as a state-machine-driven engine behind the frozen contract.
  - Keep Grok on legacy path for blast-radius control.
  - Use the new harness to drive incremental implementation with one behavior improvement at a time.
  - Create `/sss` evidence after each `ggg` implementation slice.
- Exit Criteria:
  - Gemini path uses explicit staged workflow semantics for locate input -> fill -> verify -> send -> lock response node -> wait stable -> deliver.
  - Known Phase 2 failing/risky cases are now passing under the new Gemini path.
  - No regression in the frozen message contract with `background.js`.
- Critical Test Cases:
  - Locked response node stays tied to the same post-send Gemini response, not the highest-scoring block across the page.
  - Prompt echo and tool/status text are excluded without suppressing the real final answer.
  - Final-answer completion does not rely on arbitrary full-page ranking alone.

### Phase 5: Minimal Browser Smoke and Performance Guard
- Deliverables:
  - Add 1-2 browser smoke checks for the Gemini path.
  - Measure whether the new flow adds latency beyond acceptable limits for the “AI content -> X post” workflow.
  - Capture the final evidence snapshot and recommend whether to continue rollout, pause, or widen coverage.
- Exit Criteria:
  - Smoke pass confirms the narrow happy path on the extension/browser surface, or blocked status is documented with concrete next steps.
  - Measured latency is acceptable relative to the current baseline, or the specific slow stage is identified.
  - Follow-up recommendation is evidence-based.
- Critical Test Cases:
  - End-to-end Gemini happy path on a controlled fixture page or minimal browser harness.
  - Stage timings identify whether delay comes from prompt fill, send confirmation, response lock, or completion detection.

## Evidence Protocol
- Every completed testing-oriented `ggg` phase must end with a `/sss` evidence snapshot under `/Users/non/dev/opilot/ψ/memory/logs/Xafi/`.
- Snapshot must explicitly record:
  - codebase state / commit
  - tests added or executed
  - pass/fail summary
  - what is proven true
  - what remains assumption
  - blockers and next move
- Do not promote a phase from exploratory to implementation-ready without a matching evidence snapshot.

## Risks and Countermeasures
- Risk: Test harness work accidentally mutates runtime behavior.
  - Countermeasure: Phase 1 and Phase 2 forbid behavior changes; only harness/setup and read-only characterization tests are allowed.
- Risk: jsdom cannot represent enough of Gemini’s browser behavior.
  - Countermeasure: use jsdom for deterministic fixture logic only, then add one narrow Playwright smoke layer for browser truth.
- Risk: extension testing becomes heavy and slows iteration.
  - Countermeasure: keep Playwright scope minimal; make Vitest the default gate for most changes.
- Risk: Xafi codebase fragility causes seam extraction to leak into unrelated flows.
  - Countermeasure: freeze `background.js` contract and keep Grok on legacy path until Gemini path is proven.
- Risk: current code cannot be tested meaningfully without extraction.
  - Countermeasure: Phase 2 first captures behavior through characterization tests and DOM fixtures, then Phase 3 extracts only the seams necessary to make truth measurable.

## Rollback Strategy
- Trigger rollback if:
  - test harness changes alter runtime behavior unexpectedly
  - Gemini-specific work leaks into Grok or background message flow
  - latency regresses materially without a clear cause
- Rollback steps:
  - revert only the latest phase-scoped commit(s)
  - preserve the corresponding `/sss` snapshot explaining failure mode
  - keep prior successful test harness infrastructure if it remains behavior-neutral and useful
- Hard rule:
  - never mix baseline-characterization commits with refactor commits in the same phase

## Verification Strategy
- Phase 1 Hard Gate:
  - `npm run build:dist`
  - unit test runner boots
  - no production behavior diff intended
- Phase 2 Hard Gate:
  - `npm run build:dist`
  - characterization tests execute on unmodified baseline
  - `/sss` evidence created for current truth
- Phase 3 Hard Gate:
  - `npm run build:dist`
  - seam tests pass
  - no contract regressions against background messaging
- Phase 4 Hard Gate:
  - `npm run build:dist`
  - targeted Vitest suite passes
  - implementation-phase `/sss` snapshot created
- Phase 5 Hard Gate:
  - `npm run build:dist`
  - smoke suite result captured
  - latency notes and rollout decision recorded

## Initial Tool Recommendation
- Primary: `vitest`, `jsdom`
- Secondary: `playwright`
- Avoid for now:
  - Selenium
  - Cypress
  - broad real-Gemini end-to-end as default gate

## Expected Outputs by End of This Blueprint
- A Gemini-specific testing harness that tells us what the rolled-back code actually does.
- A sequence of evidence snapshots proving whether each phase changed truth or merely intention.
- A safer implementation runway for the Gemini workflow without guessing the real runtime behavior of the extension.

## Suggested First Execution Slice
- Start with Phase 1 only.
- Do not refactor `content_ai.js` yet.
- Add the minimum test dependencies and scripts.
- Add a first jsdom fixture that models Gemini message blocks.
- Run the harness on the current codebase.
- Capture `/sss` with exact observations before any implementation work begins.