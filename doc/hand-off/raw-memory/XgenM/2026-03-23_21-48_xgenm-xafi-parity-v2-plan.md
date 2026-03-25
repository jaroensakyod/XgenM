# Snapshot: XgenM Composer Xafi Full Parity (6-Point Fix)

**Time**: 2026-03-23 21:48 +0700
**Context**: Deep-grounded from live proof failure after 30e08c2. Code-level diff of Xafi vs XgenM insertion sequence identified 6 root divergences.

---
type: plan
project: XgenM
task_id: "#xgenm-composer-xafi-parity-v2"
status: done
tags: [plan, blueprint, xgenm, xafi, composer, parity, reliability, deep-grounding]
related_files:
  - projects/XgenM/src/content/x/composer-write.ts
  - projects/XgenM/src/content/x/composer-proof.ts
  - projects/XgenM/src/content/x/composer-target.ts
  - projects/XgenM/src/content/x/composer-submit.ts
  - projects/XgenM/tests/component/content/x/composer.test.ts
  - projects/Xafi/content_x.js
---

## Objective
Fix XgenM's X composer insertion to reliably produce visible text in the real X editor by porting the **complete Xafi insertion envelope**, not just the paste primitive. The prior refactor (commit `30e08c2`) passed all 115 tests but still fails in live X because it diverges from Xafi's working sequence in 6 critical ways.

## Grounded Root Cause Analysis (Deep Code Comparison)

| Behavior | Xafi (Working) | XgenM (Failing) | Impact |
|:---|:---|:---|:---|
| **Cursor placement** | `placeCursorAtEnd()` via Selection API before paste | Missing entirely | X DraftJS editor ignores paste if caret is not positioned |
| **beforeinput gate** | NOT dispatched; uses `!pasteEvent.defaultPrevented` to decide fallback | Dispatches `beforeinput` and blocks `execCommand` if prevented | X editor likely prevents `beforeinput`, so `execCommand` never runs |
| **InputEvent type** | `inputType: 'insertText'` | `inputType: 'insertFromPaste'` | DraftJS may handle these differently |
| **Post-insert verify** | `composeTextLooksApplied()` check in writer | No verification in writer; only in proof layer | Writer can silently produce nothing |
| **Fallback typing** | `typeHumanLike()` char-by-char if verify fails | No fallback at all | Single chance → hard failure |
| **Focus sequence** | Double focus: before clear + after clear | Single focus: only before clear | Editor may lose focus during clear |

## Scope
- In Scope:
  - Rewrite `composer-write.ts` to match Xafi's full insertion envelope: `focus → clear → focus → placeCursorAtEnd → paste → conditional execCommand → InputEvent → verify → fallback typing → final verify`.
  - Add `placeCursorAtEnd()` using Selection/Range API.
  - Add inline verification using a first-24-chars substring check (matching Xafi's `composeTextLooksApplied`).
  - Add `typeHumanLike()` as a bounded fallback (max ~300 chars to prevent hang).
  - Fix `beforeinput` gating: check `pasteEvent.defaultPrevented` only, not a separate `beforeinput` dispatch.
  - Fix `InputEvent` to use `inputType: 'insertText'` (matching Xafi).
  - Tighten proof layer classification for primary vs. fallback path.
  - Expand component tests to cover paste-ignored and fallback-needed scenarios.
  - Preserve modular architecture (writer/proof/submit separation).
  - Preserve `ComposeEvidence` contract and background gating logic.
- Out of Scope:
  - Rewriting upload flow, job-runner, or background orchestration.
  - Replacing XgenM's modular structure with Xafi's monolithic approach.
  - Changing existing `composer-target.ts` scoring unless Phase 1 tests reveal targeting issues.
  - End-to-end live X tests in CI.

## Phases

### Phase 1: Fix the 6 Divergences in `composer-write.ts`
This is the critical phase — port Xafi's working sequence into XgenM's writer.

- Deliverables:
  - Add `placeCursorAtEnd(el)` function using `window.getSelection()`, `createRange()`, `selectNodeContents()`, `collapse(false)`.
  - Add `composeTextLooksApplied(el, text)` inline check: substring match on first 24 chars.
  - Add `typeHumanLike(el, text)` bounded fallback: char-by-char `execCommand('insertText')` + `InputEvent` per character, with `sleep(20-60ms)` between chars.
  - Rewrite `applyComposerTextInsertion()` to follow the exact Xafi sequence:
    1. `el.focus()` + `sleep(300)`
    2. `execCommand('selectAll')` + `execCommand('delete')` (clear)
    3. `sleep(200)`
    4. `el.focus()` (second focus)
    5. `placeCursorAtEnd(el)`
    6. Create `DataTransfer` + dispatch `ClipboardEvent('paste')`
    7. If `!pasteEvent.defaultPrevented` → `execCommand('insertText', false, text)`
    8. Dispatch `InputEvent('input', { inputType: 'insertText' })` (NOT `insertFromPaste`)
    9. `sleep(500)`
    10. Check `composeTextLooksApplied(el, text)` → if false: clear + `placeCursorAtEnd` + `typeHumanLike` + `sleep(500)` + final check
    11. Return insertion result: `{ applied: boolean, strategy: 'paste' | 'fallback' | 'failed' }`
  - Remove the `beforeinput` dispatch that was blocking `execCommand`.
  - Keep `createDataTransfer()` and `createPasteEvent()` helpers but remove `createTypingInputEvent()` for `beforeinput`.
- Exit Criteria:
  - The writer function matches Xafi's behavior semantically.
  - All existing tests still compile.
- Critical Test Cases:
  - Paste accepted (defaultPrevented=true by X editor) → `execCommand` NOT called → text present via editor handling.
  - Paste NOT handled (defaultPrevented=false) → `execCommand` IS called → text present.
  - Neither paste nor execCommand produces text → fallback typing kicks in → text present.
  - Empty text input → no insertion attempt, no errors.

### Phase 2: Update `composer-proof.ts` for Strategy Awareness
- Deliverables:
  - Accept the new insertion result from the writer to know which path succeeded.
  - Log whether primary (paste) or fallback (typing) path was used, so live debugging is clearer.
  - Update `insertionStrategy` field in `ComposeEvidence` to reflect the actual path used: `'paste'`, `'execCommand'`, `'fallback-typing'`, or `'failed'`.
  - Reduce retry count in `ensureComposerText` from 3 to 2, since the writer itself now has internal retry.
  - Keep `ComposeEvidence` contract stable for `x-post-session.ts`.
- Exit Criteria:
  - Background gating logic is not affected.
  - Logs clearly show which insertion strategy succeeded.
- Critical Test Cases:
  - `ensureComposerText()` returns `submit-ready` when writer uses fallback path.
  - `ensureComposerText()` returns `proof-failed` only when writer reports `{ applied: false }`.
  - `insertionStrategy` field correctly reflects the actual path.

### Phase 3: Expand Test Suite for Browser-Realistic Failures
- Deliverables:
  - Add test: paste event dispatched but `textContent` stays empty → fallback typing must run.
  - Add test: `execCommand('insertText')` returns true but `textContent` stays empty → fallback runs.
  - Add test: fallback typing successfully inserts per-char → `composeTextLooksApplied` returns true.
  - Add test: both paths fail → function returns `{ applied: false, strategy: 'failed' }`.
  - Replace optimistic `execCommand` mocks with controllable behavior: `vi.fn(() => false)` vs `vi.fn(() => true)`.
  - Add negative test: proof correctly reports `proof-failed` when writer returns `{ applied: false }`.
- Exit Criteria:
  - Test suite catches the exact regression class from commit `30e08c2`.
  - At least 2 new tests exercise the fallback path.
- Critical Test Cases:
  - Controllable mock where paste is ignored + execCommand is no-op → fallback path executes.
  - Verify `placeCursorAtEnd` is called before paste attempt.
  - Verify second `focus()` happens after clear.

### Phase 4: Hard Gate and Commit
- Deliverables:
  - `npm run build` passes.
  - `npm run lint` passes.
  - `npm run test` passes (all existing + new tests).
  - Single commit with message: `fix(composer): port full Xafi insertion envelope for live X parity #xgenm-composer-xafi-parity-v2`.
- Exit Criteria:
  - All three gates green.
  - Commit recorded.
- Critical Test Cases:
  - `prepare-draft` on real X with media already uploaded (manual post-commit).
  - Quote composer path where previous build returned `Composer empty after 3 attempts` (manual).
  - Retry scenario where primary paste fails but fallback succeeds (automated).

### Phase 5: Snapshot and Manual Validation Checklist
- Deliverables:
  - Capture result snapshot in `ψ/memory/logs/XgenM/`.
  - Provide manual validation checklist to user:
    - [ ] Load extension in Chrome
    - [ ] Open TikTok → Start job in prepare-draft mode
    - [ ] Verify placeholder disappears in X composer
    - [ ] Verify caption visible in real composer
    - [ ] Verify post button reflects inserted text
    - [ ] Test quote flow (with sourceUrl)
    - [ ] Test normal compose flow (without sourceUrl)
- Exit Criteria:
  - Automation green.
  - Manual checklist provided and ready for user execution.
- Critical Test Cases:
  - Same failure case that produced `Composer empty after 3 attempts` must now succeed.

## Risks & Countermeasures
- Risk: `placeCursorAtEnd()` uses `window.getSelection()` which is not available in jsdom.
  - Countermeasure: Mock `window.getSelection` in tests to verify invocation order, not DOM range behavior. Keep the function small.
- Risk: `typeHumanLike()` fallback could be slow for long captions.
  - Countermeasure: Cap fallback at first 300 characters. If caption is longer and primary paste fails, truncate gracefully for fallback.
- Risk: Xafi's `composeTextLooksApplied` only checks first 24 chars — could false-positive.
  - Countermeasure: Acceptable trade-off. The proof layer still does full verification. Writer-level check is a fast signal only.
- Risk: Double-insertion if paste works AND execCommand runs.
  - Countermeasure: Only run `execCommand` when `!pasteEvent.defaultPrevented`, matching Xafi's exact logic.
- Risk: Modular boundary collapse from putting too much logic in the writer.
  - Countermeasure: Writer verifies "did text appear", proof verifies "does it match expected + is post ready". Clear separation maintained.

## Rollback Strategy
- Trigger: If the parity refactor causes broader regressions or double-insertion.
- Action: Revert commit back to `30e08c2`. The previous paste-only implementation is still the clean baseline. Keep any new test improvements on a separate branch.

## Verification Strategy
- Build: `cd /Users/non/dev/opilot/projects/XgenM && npm run build`
- Lint: `cd /Users/non/dev/opilot/projects/XgenM && npm run lint`
- Test: `cd /Users/non/dev/opilot/projects/XgenM && npm run test`
- Manual: Load extension in Chrome → Run the same flow that produced `Composer empty after 3 attempts` → Confirm text persists.

## Tags
`plan` `xgenm` `xafi-parity-v2` `composer-insertion` `evidence-gating` `fallback-typing`

