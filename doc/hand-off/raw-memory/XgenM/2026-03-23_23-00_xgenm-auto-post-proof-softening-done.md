---
type: snapshot
project: XgenM
task_id: "#xgenm-auto-post-proof-softening"
status: completed
tags: [snapshot, xgenm, proof, auto-post, semantic-matching, hard-gate]
related_files:
  - projects/XgenM/src/content/x/composer-proof.ts
  - projects/XgenM/tests/component/content/x/composer.test.ts
  - ψ/memory/logs/XgenM/2026-03-23_22-54_xgenm-auto-post-proof-softening-plan.md
---

# Snapshot: XgenM Auto-Post Proof Softening Complete

**Time**: 2026-03-23 23:00 +0700
**Context**: Implemented the narrow proof-layer refactor from `#xgenm-auto-post-proof-softening` after live browser evidence showed a false-negative `visible-only` gate even though the X composer contained the caption and media upload was already post-ready.

## Tags
`snapshot` `xgenm` `proof` `auto-post` `semantic-matching` `hard-gate`

## Evidence
- Commit: `0510a09` — `fix(proof): soften semantic auto-post matching #xgenm-auto-post-proof-softening`
- Hard Gate: `npm run build` ✅, `npm run lint` ✅, `npm run test` ✅
- Full suite: `123/123` passing
- Scope held narrow: only `src/content/x/composer-proof.ts` and `tests/component/content/x/composer.test.ts` changed

## What Changed
- Added `matchComposerTextSemantically()` in the proof layer to distinguish strict matches from safe semantic matches.
- Preserved the existing gate contract: auto-post still requires `submit-ready`; `visible-only` still does not auto-post.
- Allowed proof to accept complete reordered readback where source/hashtags/caption are all present, instead of requiring one exact string order.
- Added mismatch reasons to proof logs and `errorDetail` so downgrade causes are visible.
- Added regression tests for:
  - reordered but complete composer text -> `submit-ready`
  - source/hashtags without caption body -> still `visible-only`

## Apply When
- A live X run shows caption visible in the composer but the submit gate still reports `visible-only`.
- DOM readback order differs from the original template order, especially around `Source:` and hashtag blocks.
- You need to improve proof accuracy without weakening post eligibility policy.

## Guardrails Kept
- Did not change upload-first sequencing.
- Did not relax `isSubmitEligible()`.
- Did not change `prepare-draft` semantics.
- Did not touch media upload, composer targeting, or background orchestration logic.

## Next Actions
- Re-run the exact TikTok -> X `auto-post` flow from the live log.
- Confirm the popup logs now reach `submit-ready`, then `Clicking Post…`, then `Posted successfully!`.
- If X exposes a new reorder pattern, extend the proof matcher with another focused regression instead of loosening the gate globally.
