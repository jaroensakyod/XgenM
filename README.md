# XGenM

Chrome extension prototype for cross-posting TikTok and Facebook Reel videos to X without using official platform APIs.

## Current Status

The project is already beyond the planning stage. The core `TikTok -> X` flow is implemented and the extension builds successfully.

Verified on 2026-03-25:

- `npm run build` passes
- `npm test` passes
- TypeScript diagnostics are clean in the current workspace
- Background orchestration, popup UI, TikTok extraction, X composer automation, and media upload flow are present
- Settings UI, persisted recovery, and job history UI are implemented
- Facebook Reel extraction has broader fallbacks but still needs live browser validation and selector maintenance

## What The Extension Does

The extension is designed to:

1. Accept a TikTok or Facebook Reel URL.
2. Extract caption text, hashtags, and video source data from the source page.
3. Open X using the user's logged-in browser session.
4. Fill the X composer and upload the video through the real X web UI.
5. Stop at draft-ready state or post automatically, depending on mode.

## Implemented Features

- Manifest V3 Chrome extension setup
- React popup rendered in the Chrome side panel
- Background service worker that orchestrates the posting job lifecycle
- Explicit job phases for progress reporting and easier debugging
- TikTok extraction with retries and HTML fallback parsing
- X composer text insertion with verification
- X media upload through the web UI file input
- Local job state persistence and runtime logs
- Caption override support from the popup
- Draft mode and auto-post mode

## Known Gaps

- Facebook Reel support is present but more fragile than TikTok support
- End-to-end runtime behavior still depends on live DOM structures on TikTok, Facebook, and X
- Browser-truth validation is still required for X because visible composer text can diverge from the submit model X actually serializes
- Full production hardening still needs more real-world validation and selector maintenance

## Tech Stack

- TypeScript
- React 18
- Vite 5
- Chrome Extension Manifest V3
- Esbuild for standalone content script bundling

## Project Structure

```text
doc/
  cross-post-extension-implementation-plan.md
  current-status-handoff.md

src/
  background/
  content/
  popup/
  shared/

manifest.json
package.json
tsconfig.json
vite.config.ts
```

## Development

### Install dependencies

```bash
npm install
```

### Build the extension

```bash
npm run build
```

Build output is written to `dist/`.

### Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select the `dist/` folder

## How To Use

1. Build and load the extension in Chrome.
2. Log in to X in the same Chrome profile.
3. Open the extension side panel.
4. Paste a TikTok or Facebook Reel URL, or use a supported active tab URL.
5. Choose `Prepare Draft` or `Auto Post`.
6. Optionally override the extracted caption.
7. Run the job and inspect the logs if anything fails.

## Important Files

- `src/background/job-runner.ts`: end-to-end orchestration and state machine
- `src/background/index.ts`: background message router and entry point
- `src/content/source/tiktok.ts`: TikTok extraction logic
- `src/content/source/facebook.ts`: Facebook Reel extraction logic
- `src/content/x/composer.ts`: X composer automation
- `src/content/x/upload.ts`: X upload handling
- `src/popup/App.tsx`: main popup UI
- `doc/current-status-handoff.md`: practical continuation notes for the next development session

## Recommended Next Work

1. Run live browser-truth validation for X submit semantics.
2. Validate Facebook extraction against current Reel layouts in Chrome.
3. Continue hardening selector diagnostics when X or Facebook DOM changes.
4. Record results from the manual regression checklist under `tests/smoke/`.

## X Composer Investigation Note

- Characterization tests now cover shared text building, upload-first orchestration, and submit-semantics probes under jsdom.
- Current evidence says `execCommand + input/change` can make caption text visible in the composer while a stricter editor model still has no submit-state evidence.
- Treat DOM text as necessary but not sufficient for auto-post safety.
- Before changing production composer logic, require both of these signals in some grounded harness or browser-truth run:
  - The visible composer text matches the expected caption.
  - A tracked submit model or browser-truth signal confirms the same caption would be serialized on submit.

## Notes

This project relies on browser automation against third-party web interfaces. That keeps it free and API-less, but it also means selector changes or login flow changes can break the runtime behavior.