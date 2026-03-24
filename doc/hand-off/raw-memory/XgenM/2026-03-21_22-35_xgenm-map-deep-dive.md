---
type: snapshot
project: XgenM
task_id: "#map-xgenm-2026-03-21"
status: active
tags: [snapshot, map, grounding, xgenm]
related_files:
  - projects/XgenM/project_map.md
  - projects/XgenM/doc/current-status-handoff.md
  - projects/XgenM/src/background/job-runner.ts
---

# Snapshot: XgenM Map Deep Dive

**Time**: 2026-03-21 22:35 +0700
**Context**: Detailed grounding for XgenM before planning or further implementation. User explicitly requested thorough map plus deep-dive snapshot.

## Tags

- XgenM
- Chrome MV3
- cross-post extension
- TikTok extraction
- X automation
- upload-first

## Insight

- XgenM is not a generic browser extension shell. It is a local-first orchestration engine for a brittle browser-automation workflow.
- The real application core is `src/background/job-runner.ts`, not the popup.
- The popup is an operator console, not just a launcher.
- The strongest truth in the system is the TikTok to X path, with a deliberate reliability decision to upload media before verifying composer text on X.

## Evidence

- `projects/XgenM/README.md` confirms the repo is already beyond planning and the TikTok to X path is the strongest implemented flow.
- `projects/XgenM/doc/current-status-handoff.md` confirms build-clean current state, explicit job phases, and the same operator-driven workflow.
- `projects/XgenM/src/background/job-runner.ts` contains the runtime orchestration, TikTok retry logic, fallback merge, text preparation, upload-first X flow, and persistence broadcasts.
- `projects/XgenM/src/popup/App.tsx` confirms the operator surface: URL input, mode toggle, caption override, status, preview, and logs.
- `projects/XgenM/src/content/source/tiktok.ts` shows the deepest extraction strategy in the project.
- `projects/XgenM/src/content/x/composer.ts` and `projects/XgenM/src/content/x/upload.ts` show how X automation depends on selector families and UI heuristics instead of APIs.

## Map Summary

- Philosophy:
  - Browser truth over official APIs
  - Operator visibility over black-box automation
  - Reliability over architectural purity
- Core layers:
  - Popup side panel
  - Background service worker orchestrator
  - Source content scripts
  - X content script
  - Shared contracts and utilities
- Persistence:
  - `chrome.storage.local` only
  - No backend, no queue, no remote database
- Build:
  - Vite for popup and background
  - esbuild for standalone content scripts

## Risks

- Third-party DOM drift across TikTok, Facebook, and X is the main structural risk.
- Facebook Reel is materially weaker than TikTok and should stay a secondary path until hardened.
- Upload-complete detection on X depends on UI heuristics and can regress silently.
- No automated tests exist yet, so regression confidence still depends on manual live validation.

## Apply When

- Before drafting `/ppp` for XgenM
- Before hardening Facebook extraction
- Before debugging X upload failures
- Before redesigning popup UX or settings surfaces

## Guardrails

- Do not treat the popup as the primary source of system behavior; treat background orchestration as the canonical runtime core.
- Do not collapse the upload-first sequence on X without live evidence that another order is more stable.
- Do not claim Facebook parity with TikTok based on current code.
- Do not add architectural weight such as a backend unless the operator model and failure modes justify it.

## Next Actions

1. Use `projects/XgenM/project_map.md` as the canonical grounding file for future XgenM work.
2. Create a manual regression checklist covering TikTok draft flow and X upload flow.
3. Open a separate plan if Facebook hardening becomes the next implementation thread.
4. Add deterministic tests around shared utilities before attempting full E2E automation.
