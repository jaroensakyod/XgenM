# Cross-Post Extension Implementation Plan

> Current implementation status has moved beyond planning. For a practical handoff summary of what is already built and what should happen next, see `doc/current-status-handoff.md`.

## 1. Objective

Build a free Chrome extension that can:

1. Accept a TikTok or Facebook Reel link.
2. Extract the video, caption text, and hashtags from the source page.
3. Open x.com with the user's existing logged-in session.
4. Prepare and optionally publish a post containing the video, caption, and hashtags.
5. Avoid using official platform APIs.

This document turns the concept into an implementation plan that is realistic, phased, and detailed enough to start building.

## 2. Product Decision

The correct product shape is a Chrome extension, not a VS Code extension.

Reason:

- The work depends on browser tabs, DOM inspection, page automation, file upload, and logged-in browser sessions.
- Chrome extension APIs provide the right primitives for tab control, script injection, storage, and downloads.
- A VS Code extension would still need an external browser automation layer, which adds complexity without helping the core workflow.

## 3. Core User Flow

### Primary flow

1. User opens the extension popup.
2. User pastes a TikTok or Facebook Reel URL, or chooses the current tab.
3. Extension opens the source page if needed.
4. Extension extracts:
   - video source
   - caption text
   - hashtags
   - optional author/source attribution
5. Extension downloads or reconstructs the video as a `File` object.
6. Extension opens x.com compose flow.
7. Extension fills the text composer.
8. Extension injects the video into X's media upload input.
9. Extension either:
   - stops at draft-ready state, or
   - clicks Post automatically

### Recommended modes

Two modes should exist from the start:

- `Prepare Draft`: safest mode, prepares the post and waits for user confirmation.
- `Auto Post`: full automation mode for trusted flows after the MVP is stable.

## 4. Constraints and Design Reality

## Free and no API

This requirement is achievable, but the trade-off is operational fragility.

- No official upload API means upload must happen through the real X web interface.
- No official TikTok/Facebook API means extraction must come from DOM, page state, or browser-observable requests.
- Any UI or markup changes in the target platforms can break the flow.

## Legal and platform constraints

This project must assume:

- The user is responsible for rights to repost the content.
- Platform terms may restrict scraping or automation.
- The extension should include warnings and require explicit user confirmation when enabling full auto-post mode.

## Technical risk ranking

From hardest to easiest:

1. Facebook Reel video extraction
2. Stable X auto-post automation
3. Cross-site upload state handling
4. TikTok extraction
5. Popup-driven orchestration

## 5. Scope Definition

### In scope for v1

- Chrome extension with Manifest V3
- Support for TikTok source links
- Draft preparation on X
- Video upload through X web UI
- Caption and hashtag extraction
- Manual edit before posting
- Retry and timeout handling
- Basic debug logging

### In scope for v1.5

- Auto-click Post on X
- Caption templating
- Better upload/composer state detection
- Job history in local storage

### In scope for v2

- Facebook Reel support
- Multiple extraction strategies per platform
- Queue support for sequential posts
- Better resilience against selector changes

### Out of scope initially

- Scheduled posting
- Multi-account X switching
- Server-side processing
- OCR, transcription, or AI caption rewriting
- Large-scale bulk posting

## 6. Architecture

## High-level components

1. Popup UI
2. Background service worker
3. Source content scripts
4. X content script
5. Shared domain types and utilities

## Component responsibilities

### Popup UI

Responsibilities:

- Accept source URL or detect active tab URL
- Show extraction preview
- Allow caption editing
- Toggle `Prepare Draft` vs `Auto Post`
- Display errors and logs

### Background service worker

Responsibilities:

- Coordinate the end-to-end job lifecycle
- Open and track tabs
- Send and receive runtime messages
- Manage state transitions
- Execute fetch/download steps where allowed
- Persist settings and last-run data

### Source content scripts

Separate scripts should exist for:

- TikTok
- Facebook Reel

Responsibilities:

- Read DOM or page-level state
- Detect media URLs or usable video elements
- Extract text metadata
- Return normalized extraction results

### X content script

Responsibilities:

- Detect compose UI readiness
- Fill caption text into the composer
- Inject media file into upload input
- Observe upload completion
- Click Post in auto mode
- Return status updates to the background worker

## 7. Proposed File Structure

```text
doc/
  cross-post-extension-implementation-plan.md

src/
  background/
    index.ts
    job-runner.ts
    tab-manager.ts
    storage.ts
  popup/
    index.html
    main.tsx
    App.tsx
    components/
      UrlInput.tsx
      PreviewCard.tsx
      ModeToggle.tsx
      RunButton.tsx
      LogPanel.tsx
  content/
    source/
      tiktok.ts
      facebook.ts
      page-bridge.ts
    x/
      composer.ts
      upload.ts
      selectors.ts
  shared/
    types.ts
    messages.ts
    constants.ts
    errors.ts
    text.ts
    url.ts
    timing.ts
  assets/
    icons/

manifest.json
package.json
tsconfig.json
vite.config.ts
```

## 8. Domain Model

## Core types

```ts
export type SourcePlatform = 'tiktok' | 'facebook';

export type RunMode = 'prepare-draft' | 'auto-post';

export interface ExtractedSourceData {
  platform: SourcePlatform;
  sourceUrl: string;
  canonicalUrl?: string;
  authorName?: string;
  authorHandle?: string;
  captionRaw: string;
  hashtags: string[];
  videoUrl?: string;
  videoMimeType?: string;
  extractionMethod:
    | 'video-tag'
    | 'embedded-state'
    | 'network-observed'
    | 'unknown';
}

export interface PreparedPost {
  text: string;
  fileName: string;
  sourceCredit?: string;
}

export interface JobState {
  jobId: string;
  mode: RunMode;
  sourceUrl: string;
  platform: SourcePlatform;
  phase:
    | 'idle'
    | 'opening-source'
    | 'extracting'
    | 'downloading-video'
    | 'opening-x'
    | 'filling-composer'
    | 'uploading-media'
    | 'awaiting-review'
    | 'posting'
    | 'completed'
    | 'failed';
  logs: string[];
  error?: string;
}
```

## 9. End-to-End State Machine

The extension should be built around a small explicit state machine instead of loose message passing.

### State transitions

```text
idle
  -> opening-source
  -> extracting
  -> downloading-video
  -> opening-x
  -> filling-composer
  -> uploading-media
  -> awaiting-review | posting
  -> completed | failed
```

Reason:

- Easier debugging
- Easier retry behavior
- Easier user-facing progress reporting
- Fewer hidden race conditions

## 10. Source Extraction Strategy

## TikTok strategy

TikTok should be implemented first because it is usually more tractable than Facebook Reel.

### Extraction order

1. Read visible caption from DOM.
2. Parse hashtags from visible text.
3. Attempt to locate `video` element and read current source.
4. If not available, inspect page state objects or embedded JSON.
5. If still not available, inject a page bridge to observe media-related requests.

### Data points to collect

- source URL
- caption text
- hashtags
- author display name
- author handle if present
- best available media URL

### TikTok implementation note

The script should avoid assuming a single selector. It should use a ranked list of selectors and text heuristics.

## Facebook Reel strategy

Facebook should be treated as a second-phase platform because:

- markup changes more often
- media URLs are more guarded
- login state and permissions vary more

### Extraction order

1. Read visible description text.
2. Identify reel player video element.
3. Attempt usable `src` extraction.
4. If not available, inspect page scripts or React payloads.
5. If still blocked, mark extraction as unsupported for that page and fail clearly.

### Important decision

Do not hold the v1 release hostage to Facebook support. Build the architecture to allow Facebook later, but ship TikTok first.

## 11. Video Retrieval Strategy

The extension should use the simplest viable retrieval path first.

### Preferred retrieval sequence

1. Direct fetch of `videoUrl` into `Blob`
2. Convert `Blob` to `File`
3. Pass file metadata to X upload flow

### Fallbacks

- Retry with current tab context if service worker fetch is blocked
- Use page-side fetch bridged through content script if origin restrictions require it
- If fetch fails, stop with actionable error instead of forcing a broken upload flow

### File naming

Use deterministic names:

- `tiktok-<timestamp>.mp4`
- `facebook-reel-<timestamp>.mp4`

## 12. Caption and Hashtag Processing

Caption logic should be normalized before sending to X.

### Recommended text pipeline

1. Trim whitespace
2. Collapse repeated blank lines
3. Extract hashtags into an array
4. Remove duplicates
5. Rebuild final post text
6. Ensure text fits X posting constraints

### Suggested post template

```text
{caption_clean}

{hashtags_joined}

Source: {source_label}
```

### Rules

- Keep source attribution optional via settings
- Limit hashtags by default to 3 to 6
- Provide live character count in popup
- If text is too long, trim gracefully before upload stage

## 13. X Automation Strategy

This is the most sensitive part and needs defensive engineering.

## Compose flow

### Required steps

1. Open x.com in a new tab.
2. Detect whether user is logged in.
3. Detect composer availability.
4. Insert text into the composer.
5. Locate media file input.
6. Attach `File` object.
7. Wait for upload readiness.
8. Either stop for review or click Post.

### Important design choice

Prefer using the main X compose surface that already exists for logged-in users instead of relying on brittle deep-link flows when possible.

## X composer automation details

The X content script should implement utilities for:

- waiting for an element with timeout
- testing multiple selectors in priority order
- dispatching realistic input events after text insertion
- waiting for upload completion indicators
- locating the Post button only after composer is valid

### Reliability rules

- Never click Post before upload completion is confirmed.
- Never assume the first matching button is correct.
- Never continue if login or anti-bot interstitial appears.
- Surface human-readable status back to popup.

## 14. Permissions and Manifest

The extension will need at minimum:

- `tabs`
- `storage`
- `scripting`
- `activeTab`
- host permissions for TikTok, Facebook, and X

### Manifest direction

```json
{
  "manifest_version": 3,
  "name": "Cross Post to X",
  "version": "0.1.0",
  "permissions": ["tabs", "storage", "scripting", "activeTab"],
  "host_permissions": [
    "https://*.tiktok.com/*",
    "https://*.facebook.com/*",
    "https://x.com/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://*.tiktok.com/*"],
      "js": ["content-tiktok.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://*.facebook.com/*"],
      "js": ["content-facebook.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://x.com/*"],
      "js": ["content-x.js"],
      "run_at": "document_idle"
    }
  ]
}
```

This is not final manifest content, but it is the correct baseline.

## 15. Error Handling Strategy

Error handling must be explicit and user-visible.

### Error categories

- unsupported URL
- extraction failed
- video fetch failed
- X login missing
- X composer not found
- media upload failed
- post button unavailable
- timeout exceeded

### UX behavior

- Show current phase
- Show last successful step
- Show actionable error text
- Provide retry from failed step where safe

## 16. Observability and Debugging

The MVP should include basic diagnostics from day one.

### Required logs

- job start time
- detected platform
- extraction method used
- video URL presence or absence
- X composer detection success
- upload completion result
- final post or draft outcome

### Logging surfaces

- popup log panel
- browser console for content scripts
- background service worker logs

## 17. Security and Privacy

The extension should minimize stored data.

### Store only

- user settings
- last used mode
- optional recent job summaries

### Do not store

- platform credentials
- cookies
- raw session tokens
- unnecessary long-lived media blobs

### Privacy note

If job history is added, keep it local only. No backend is needed.

## 18. Delivery Roadmap

## Phase 0: Technical validation

Goal:

- Prove TikTok extraction and X draft preparation work in a dev build.

Tasks:

1. Set up extension scaffold with TypeScript and Vite.
2. Implement popup with URL input and mode toggle.
3. Implement TikTok extraction script for caption and hashtags.
4. Verify at least one workable video retrieval method.
5. Implement X composer text insertion.

Exit criteria:

- User can generate a draft post on X from a TikTok URL.

## Phase 1: MVP release

Goal:

- Deliver stable TikTok to X workflow with draft-ready posting.

Tasks:

1. Add Blob to File conversion.
2. Implement media upload into X.
3. Add timeout and retry wrappers.
4. Add log panel and status messages.
5. Add settings for source attribution and hashtag count.

Exit criteria:

- TikTok URL can produce a complete X draft with video attached.

## Phase 1.5: Controlled automation

Goal:

- Add optional full post automation.

Tasks:

1. Implement upload completion detection.
2. Implement guarded Post click.
3. Add confirmation warning before enabling auto-post.
4. Add fail-safe stop if unexpected dialogs appear.

Exit criteria:

- Auto-post succeeds consistently in known scenarios.

## Phase 2: Facebook Reel support

Goal:

- Extend the platform layer without rewriting the core flow.

Tasks:

1. Implement Facebook extractor module.
2. Add platform-specific fallbacks.
3. Expand unsupported-case messaging.
4. Add regression testing across both source platforms.

Exit criteria:

- Supported Facebook Reel pages can reach X draft-ready state.

## 19. Task Breakdown for Implementation

## Foundation

1. Initialize extension project.
2. Configure build pipeline.
3. Define shared types and runtime messages.
4. Build popup UI shell.

## Orchestration

1. Implement job runner in background worker.
2. Implement tab open/focus logic.
3. Implement phase transitions and status broadcasting.

## TikTok extraction

1. Detect supported TikTok URL patterns.
2. Extract caption and hashtags.
3. Detect usable video source.
4. Return normalized data.

## X composer

1. Detect logged-in state.
2. Detect composer.
3. Insert text reliably.
4. Locate file input.
5. Upload media.
6. Detect completion.

## UX

1. Preview extracted data.
2. Let user edit text before execution.
3. Show progress and errors.
4. Persist user settings.

## Hardening

1. Add retries and timeouts.
2. Add selector fallback sets.
3. Add better status logs.
4. Add manual recovery paths.

## 20. Testing Strategy

Because this project depends on changing third-party UIs, testing must mix automated checks with manual scenario testing.

## Automated tests

Target:

- text normalization utilities
- URL parsing
- message schema validation
- state machine transitions

## Manual regression matrix

Minimum scenarios:

1. TikTok public video with short caption
2. TikTok public video with multiple hashtags
3. TikTok page with delayed media load
4. X logged-in home composer flow
5. X not logged in
6. upload timeout or failure case

### Later scenarios

1. Facebook Reel public page
2. Facebook Reel unavailable video source
3. X composer variant changes

## 21. Acceptance Criteria

The implementation is good enough for MVP when all of the following are true:

1. User can paste a TikTok URL into the popup.
2. Extension can extract caption and hashtags.
3. Extension can obtain a usable video file.
4. Extension can open X and populate the composer.
5. Extension can attach the video.
6. In `Prepare Draft` mode, the draft is ready without requiring manual reconstruction.
7. Errors are understandable and do not leave the user guessing.

## 22. Recommended Build Order

This is the fastest low-risk order:

1. Project scaffold
2. Popup UI shell
3. Shared message protocol
4. TikTok extractor
5. X text composer automation
6. Video retrieval
7. X media upload
8. Draft mode stabilization
9. Auto-post mode
10. Facebook Reel support

## 23. Final Recommendation

The strongest implementation strategy is:

1. Build a Chrome extension with Manifest V3.
2. Ship TikTok support first.
3. Make `Prepare Draft` the MVP default.
4. Add `Auto Post` only after upload detection is stable.
5. Treat Facebook Reel as a second-phase source.

This approach best satisfies the user's requirements while reducing the two biggest failure modes:

- trying to support too many fragile source platforms at once
- trying to auto-post before the extraction and upload pipeline is stable

## 24. Immediate Next Build Step

If implementation starts now, the next concrete milestone should be:

`Create the Chrome extension scaffold with TypeScript, Vite, popup shell, background worker, shared message types, and a first TikTok extractor skeleton.`

That is the smallest slice that proves the architecture and keeps the project moving toward a working MVP.