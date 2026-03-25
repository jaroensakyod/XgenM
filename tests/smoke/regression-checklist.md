# XGenM Manual Regression Checklist

Last updated: 2026-03-25

## Preconditions

1. Run `npm install` if `node_modules/.bin/vitest` is missing.
2. Run `npm test`.
3. Run `npm run build`.
4. Load the unpacked extension from `dist/` in Chrome.
5. Ensure one X tab is logged in and can open the composer.

## Scenario 1: TikTok to X draft

1. Open a supported TikTok video page.
2. Open the extension side panel.
3. Confirm the source URL auto-fills.
4. Select `Prepare Draft`.
5. Start the job.

Expected phases:

1. `OPENING SOURCE`
2. `EXTRACTING`
3. `DOWNLOADING VIDEO`
4. `OPENING X`
5. `UPLOADING MEDIA`
6. `FILLING COMPOSER`
7. `AWAITING REVIEW`

Expected logs:

1. `Prepared post text:`
2. `Media uploaded successfully.`
3. `Visible verification [proof]:`
4. `Submit gate [gating]: mode=prepare-draft decision=draft-review`

Regression classification:

1. Missing caption or hashtags: extraction layer
2. No video file: video fetch layer
3. Composer text absent: composer layer

## Scenario 2: TikTok to X auto-post proof-gated path

1. Open a supported TikTok video page.
2. Switch mode to `Auto Post`.
3. Start the job.

Expected result:

1. If proof is `submit-ready`, final phase is `COMPLETED`.
2. If proof is `draft-ready` or `visible-only`, final phase is `AWAITING REVIEW` and posting does not fire.

Expected logs:

1. `Visible verification [proof]: status=`
2. `Submit gate [gating]: mode=auto-post decision=`
3. `Posted successfully!` only when decision is `post`

Regression classification:

1. False post despite weak proof: submit gate layer
2. Good proof but post click fails: submit button layer

## Scenario 3: TikTok extraction retry path

1. Open a TikTok page that initially shows a collapsed or weak caption.
2. Start in either mode.

Expected logs:

1. `TikTok caption still incomplete — retrying extraction`
2. Optional `Page extraction incomplete — trying TikTok HTML fallback…`

Regression classification:

1. Retry never triggers on weak caption: extraction retry layer
2. Fallback runs but returns empty: HTML fallback layer

## Scenario 4: X upload timeout or failure

1. Simulate a slow network or large media condition.
2. Start a TikTok run.

Expected result:

1. Final phase is `FAILED`.
2. Popup shows a recovery hint for media upload failure.

Expected logs:

1. `Uploading media to X…`
2. `Error:` with upload context

Regression classification:

1. Failure before upload begins: video fetch layer
2. Failure after file chooser/input: upload layer

## Scenario 5: Facebook best-effort extraction path

1. Open a supported Facebook Reel or Facebook video permalink.
2. Start a draft run.

Expected logs:

1. `[facebook] Extraction attempt`
2. `Extraction method:` in the popup runtime log after background receives data

Regression classification:

1. Caption missing but video found: Facebook selector or payload caption parsing
2. Video missing but caption found: Facebook media discovery or payload parsing
3. Both missing: Facebook layout or guarded page state

## Failure Triage Matrix

1. Source page issue: extraction, retry, or HTML/payload fallback
2. Binary transfer issue: video fetch or blob conversion
3. X page issue: upload, composer, proof, or post click
4. Safety issue: proof gate classification or incorrect auto-post decision