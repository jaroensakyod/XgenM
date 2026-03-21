# XGenM

Chrome extension prototype for cross-posting TikTok and Facebook Reel videos to X without using official platform APIs.

## Current Status

The project is already beyond the planning stage. The core `TikTok -> X` flow is implemented and the extension builds successfully.

Verified on 2026-03-21:

- `npm run build` passes
- TypeScript diagnostics are clean in the current workspace
- Background orchestration, popup UI, TikTok extraction, X composer automation, and media upload flow are present
- Facebook Reel extraction exists as a best-effort Phase 2 implementation and still needs hardening

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
- There are no automated tests yet
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

1. Harden Facebook Reel extraction with more fallback strategies.
2. Add settings UI for source credit, hashtag limits, and caption templates.
3. Add a lightweight manual regression checklist for TikTok and X UI changes.
4. Add automated tests around shared text and URL utilities.
5. Improve failure reporting when upload or composer selectors change.

## Notes

This project relies on browser automation against third-party web interfaces. That keeps it free and API-less, but it also means selector changes or login flow changes can break the runtime behavior.