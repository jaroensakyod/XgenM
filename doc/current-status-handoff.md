# XGenM Current Status Handoff

Last updated: 2026-03-21

## Summary

This repository already contains a working first-pass implementation of the Chrome extension. It is no longer only a planning repo.

The most complete path today is:

`TikTok URL -> extract source data -> prepare post text -> open X -> fill composer -> upload media -> await review or auto-post`

The codebase builds successfully with `npm run build` in the current workspace.

## What Is Working

### Extension shell

- Manifest V3 setup is present
- Popup UI is implemented as a React side panel
- Background service worker receives runtime messages and starts jobs
- Shared types/messages/constants are organized cleanly

### Job orchestration

- The main pipeline lives in `src/background/job-runner.ts`
- Job state is modeled explicitly with phases such as `extracting`, `opening-x`, `uploading-media`, and `completed`
- Runtime logs are broadcast back to the popup and persisted
- Last job and job history are stored with `chrome.storage.local`

### TikTok extraction

- Content script support exists in `src/content/source/tiktok.ts`
- Caption extraction uses ranked selectors plus fallback heuristics
- The script attempts to expand collapsed captions before reading text
- Extraction retries are already built into the background flow
- There is also an HTML fetch fallback in the background worker for cases where the page DOM does not expose enough data

### X automation

- Composer selection is defensive and scores multiple candidates
- Caption insertion verifies that expected text actually appears in the composer
- Media upload is handled through the native web input element
- Upload completion waits for UI signals before proceeding
- The implementation preference is upload first, then confirm text state, which is more reliable for X

### Popup UX

- URL entry is implemented
- Mode toggle exists for `prepare-draft` and `auto-post`
- Caption override exists
- Logs and current job status are visible in the UI

## What Is Partially Implemented

### Facebook Reel flow

- `src/content/source/facebook.ts` exists and can extract some caption/video data
- This is explicitly treated as a less reliable Phase 2 path
- Expect more breakage here than on TikTok because Facebook markup changes often

### Persistence and settings

- Storage helpers already exist
- Default settings are defined in shared types
- There is no full settings management UI yet

## Main Risks

1. DOM and selector fragility on TikTok, Facebook, and X
2. X upload state changes that may invalidate current completion heuristics
3. TikTok pages that hide caption/video data until SPA hydration settles
4. Large video fetches or blob conversions that may be slow in the extension context

## Practical Next Steps

### High priority

1. Test the end-to-end TikTok flow against multiple real URLs and record failures.
2. Harden Facebook extraction with more selector sets and page-state parsing.
3. Add a small settings screen for source credit, max hashtags, and caption template.
4. Improve user-facing error messages when X composer or upload selectors fail.

### Medium priority

1. Add a regression checklist document for manual testing after platform UI changes.
2. Add tests for shared utility functions such as URL detection, hashtag extraction, and caption truncation.
3. Add structured debug markers for each job phase so logs are easier to compare across runs.

## Suggested Resume Path For The Next Session

If continuing this project later, start in this order:

1. Run `npm install` if dependencies are missing.
2. Run `npm run build` and confirm the build still passes.
3. Load `dist/` as an unpacked extension in Chrome.
4. Run a TikTok to X draft flow first, not auto-post.
5. Inspect popup logs for any selector or upload regressions.
6. Only then continue with Facebook hardening or UI enhancements.

## Important Files To Read First

- `src/background/job-runner.ts`
- `src/content/source/tiktok.ts`
- `src/content/x/composer.ts`
- `src/content/x/upload.ts`
- `src/popup/App.tsx`
- `src/shared/types.ts`

## Validation Snapshot

Verified in this workspace on 2026-03-21:

- `npm run build` completed successfully
- VS Code diagnostics returned no errors for the workspace

## Notes

- There is a build marker in the job runner: `2026-03-21-upload-first-v2`
- Repository memory notes indicate TikTok caption extraction can require retries and that the X flow is more reliable when media is uploaded before caption verification
- Because this extension avoids official APIs, maintenance will mostly mean adapting to markup changes over time