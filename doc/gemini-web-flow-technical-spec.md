# Gemini Web Flow Technical Spec

Last updated: 2026-03-25
Status: proposed
Scope: add Gemini web-tab orchestration to the existing extension without using any Google API

## 1. Purpose

This document defines a grounded implementation spec for adding a Gemini web flow to this repository.

The intended behavior is:

1. The extension opens `https://gemini.google.com/` in a controlled tab.
2. The extension pastes a generated prompt into the Gemini web UI.
3. The extension waits for Gemini to finish responding.
4. The extension extracts structured draft candidates from the Gemini response.
5. The extension returns those candidates to the popup and existing X draft flow.

This spec does not use Google APIs. It relies on browser-tab automation in the same style as the existing X automation flow.

## 2. Goals

### In scope

- Open a Gemini tab from the background service worker.
- Inject a dedicated Gemini content script via manifest matching.
- Submit a prompt through the Gemini web UI.
- Wait for a full response or a hard timeout.
- Extract plain-text candidate drafts from the Gemini response.
- Surface candidates to the popup for human review.
- Allow the selected candidate to be handed off into the existing X compose flow.

### Out of scope

- Auto-submitting Gemini output directly to X without user review.
- Managing Google account login state.
- Solving captchas, consent screens, or anti-abuse challenges.
- Providing durable automation against all Gemini UI redesigns.
- Building a full inspiration crawler or engagement automation.

## 3. Current Architecture Constraints

The spec must fit the repository's existing architecture:

- Background orchestration lives in `src/background/index.ts` and `src/background/job-runner.ts`.
- Runtime message contracts live in `src/shared/messages.ts`.
- Shared domain types live in `src/shared/types.ts`.
- Content-script entry points already exist for source sites and X.
- The popup already listens for `JOB_STATE_UPDATE` and loads persisted state from storage.
- The extension currently stores settings, last job, and job history in `chrome.storage.local`.

The Gemini flow should therefore be added as a sibling pipeline to the existing X content automation, not as a one-off helper hidden inside popup code.

## 4. High-Level Flow

### 4.1 Happy-path flow

1. User starts a source job from the popup.
2. Background extracts source data as it does today.
3. Background builds a Gemini prompt from the extracted post and optional user guidance.
4. Background opens or focuses a Gemini tab.
5. Background waits for Gemini page readiness.
6. Background sends `GEMINI_GENERATE` to the Gemini content script.
7. Gemini content script locates the prompt input, inserts the prompt, and submits it.
8. Gemini content script waits until response generation is complete.
9. Gemini content script extracts the response text.
10. Background parses the response into candidate drafts.
11. Background updates job state with Gemini output.
12. Popup renders the candidates and allows selection.
13. User chooses one candidate.
14. Background runs the existing X draft flow using the selected text.

### 4.2 Minimal user-visible lifecycle

The user should see these distinct phases:

1. Extracting source
2. Opening Gemini
3. Generating drafts
4. Awaiting candidate selection
5. Opening X
6. Filling composer
7. Awaiting review or posting

## 5. State Model Changes

## 5.1 `JobPhase` additions in `src/shared/types.ts`

Add the following phases:

- `opening-gemini`
- `generating-draft`
- `awaiting-draft-selection`

Resulting phase order for Gemini-assisted runs:

1. `opening-source`
2. `extracting`
3. `opening-gemini`
4. `generating-draft`
5. `awaiting-draft-selection`
6. `opening-x`
7. `uploading-media`
8. `filling-composer`
9. `awaiting-review` or `posting`
10. `completed` or `failed`

## 5.2 `JobState` additions in `src/shared/types.ts`

Add optional fields to persist Gemini work products and control handoff:

```ts
export interface GeminiDraftOption {
  id: string;
  text: string;
  index: number;
}

export interface GeminiPromptContext {
  topic: string;
  sourceText: string;
  tone?: string;
  promptText: string;
}

export interface GeminiGenerationResult {
  rawResponseText: string;
  options: GeminiDraftOption[];
  selectedOptionId?: string;
}
```

Extend `JobState` with:

```ts
geminiPrompt?: GeminiPromptContext;
geminiResult?: GeminiGenerationResult;
```

Rationale:

- `geminiPrompt` is useful for debugging and repeatability.
- `geminiResult.rawResponseText` preserves the unparsed answer for support/debug.
- `selectedOptionId` lets popup and background coordinate handoff into X.

## 5.3 `UserSettings` additions in `src/shared/types.ts`

Add a Gemini configuration subset:

```ts
export interface UserSettings {
  defaultMode: RunMode;
  includeSourceCredit: boolean;
  maxHashtags: number;
  captionTemplate: string;
  useGeminiDraftAssist: boolean;
  geminiTone: string;
  geminiOptionCount: number;
  geminiMaxDraftChars: number;
  geminiTimeoutMs: number;
}
```

Suggested defaults:

- `useGeminiDraftAssist: false`
- `geminiTone: 'natural, concise, human'`
- `geminiOptionCount: 3`
- `geminiMaxDraftChars: 220`
- `geminiTimeoutMs: 90000`

Normalization rules:

- `geminiOptionCount` clamp to `1..5`
- `geminiMaxDraftChars` clamp to `80..260`
- `geminiTimeoutMs` clamp to `15000..120000`

## 6. Runtime Message Contract

## 6.1 New message actions in `src/shared/messages.ts`

Add these action types:

- `GEMINI_GENERATE`
- `GEMINI_RESULT`
- `SELECT_GEMINI_DRAFT`

## 6.2 Message shapes

```ts
export interface GeminiGenerateMessage {
  action: 'GEMINI_GENERATE';
  promptText: string;
  timeoutMs: number;
}

export interface GeminiResultMessage {
  action: 'GEMINI_RESULT';
  success: boolean;
  rawResponseText?: string;
  error?: string;
}

export interface SelectGeminiDraftMessage {
  action: 'SELECT_GEMINI_DRAFT';
  jobId: string;
  optionId: string;
}
```

Add these to the `RuntimeMessage` union.

Rationale:

- `GEMINI_GENERATE` mirrors the existing `COMPOSE_POST` and `UPLOAD_MEDIA` pattern.
- `GEMINI_RESULT` keeps the background worker in control of parsing and state transitions.
- `SELECT_GEMINI_DRAFT` makes popup-to-background handoff explicit and replayable.

## 7. File-Level Implementation Plan

## 7.1 New files

### `src/content/gemini/index.ts`

Role:

- Gemini content-script entry point.
- Registers `chrome.runtime.onMessage` listener.
- Handles `GEMINI_GENERATE`.
- Returns a `GEMINI_RESULT`-shaped response.

Responsibilities:

- Validate login/readiness heuristics.
- Call lower-level DOM helpers.
- Catch and normalize errors.

### `src/content/gemini/selectors.ts`

Role:

- Centralize Gemini UI selectors and selector ranking.

Contents:

- Prompt input selector list
- Submit button selector list
- Response container selector list
- Generating/loading state selector list
- Login wall / sign-in page selectors

### `src/content/gemini/prompt.ts`

Role:

- DOM helper functions for finding the prompt input and inserting text.

Suggested exported functions:

- `resolvePromptInput()`
- `setPromptText(input: HTMLElement, text: string)`
- `submitPrompt()`

### `src/content/gemini/response.ts`

Role:

- Wait for Gemini response completion.
- Extract response text from the last completed answer block.

Suggested exported functions:

- `waitForGenerationStart()`
- `waitForGenerationComplete(timeoutMs: number)`
- `extractLatestResponseText()`

### `src/background/gemini-session.ts`

Role:

- Background-side orchestration for Gemini tab lifecycle.

Responsibilities:

- Open or focus the Gemini tab.
- Wait for tab load.
- Send `GEMINI_GENERATE` to the Gemini content script.
- Return raw response text to `job-runner.ts`.

Suggested exported function:

```ts
export async function runGeminiDraftSession(
  promptText: string,
  timeoutMs: number,
): Promise<{ rawResponseText: string }>;
```

### `src/shared/gemini.ts`

Role:

- Shared prompt building and response parsing.

Suggested exported functions:

- `buildGeminiPrompt(...)`
- `parseGeminiDraftOptions(rawText: string)`
- `normalizeDraftCandidate(text: string)`

This module should stay DOM-free so it can be unit tested easily.

## 7.2 Existing files to update

### `manifest.json`

Required changes:

- Add `https://gemini.google.com/*` to `host_permissions`.
- Add a Gemini content script bundle to `content_scripts`.

Example target entry:

```json
{
  "matches": ["https://gemini.google.com/*"],
  "js": ["content-gemini.js"],
  "run_at": "document_idle"
}
```

### `src/shared/constants.ts`

Add Gemini-specific constants:

- `GEMINI_PAGE_URL`
- `GEMINI_WAIT_TIMEOUT`
- `GEMINI_RESPONSE_POLL_INTERVAL`
- `GEMINI_DEFAULT_RESPONSE_TIMEOUT`

### `src/shared/types.ts`

Add:

- new job phases
- Gemini prompt/result data types
- new user settings

### `src/shared/messages.ts`

Add:

- new Gemini runtime messages
- union members

### `src/background/job-runner.ts`

Add Gemini orchestration branch after source extraction and before X composition.

New responsibilities:

1. Build Gemini prompt when settings enable draft assist.
2. Update `currentJob.phase` to `opening-gemini`.
3. Run Gemini session.
4. Parse returned response into draft options.
5. Update `currentJob.geminiPrompt` and `currentJob.geminiResult`.
6. Broadcast `awaiting-draft-selection`.
7. Stop the automatic pipeline until user selects a candidate.
8. Resume the existing X flow after selection.

Implementation note:

The current `startJob()` flow is likely linear. To support a pause at `awaiting-draft-selection`, the code should be split into two resumable steps:

- `startJob(...)` runs through extraction and Gemini generation.
- `resumeJobWithGeminiDraftSelection(jobId, optionId)` continues from the stored job state.

### `src/background/index.ts`

Add handling for:

- `SELECT_GEMINI_DRAFT`

The message router should:

1. validate that the job exists
2. validate that the selected draft ID exists
3. call the resume function in `job-runner.ts`
4. send an ack or error response

### `src/background/storage.ts`

No new storage key is strictly required if Gemini state remains embedded in `JobState`.

Required work:

- ensure `saveLastJob()` and history persistence keep the new Gemini fields intact
- no schema migration should be needed because the new fields are optional

### `src/popup/App.tsx`

Add UI for:

- showing generated draft options
- selecting one option
- sending `SELECT_GEMINI_DRAFT`
- showing Gemini-specific statuses and errors

The popup should not parse raw Gemini text. It should consume already-parsed `job.geminiResult.options` from background state.

## 8. Job Runner Refactor Shape

## 8.1 Current limitation

The existing job runner appears optimized for a straight-through pipeline.

Gemini introduces a pause point where the user must choose a generated draft before the X flow can continue.

## 8.2 Proposed orchestration split

Implement the job runner as two explicit stages.

### Stage A: pre-selection

Function shape:

```ts
async function runPreparationStage(
  sourceUrl: string,
  mode: RunMode,
  captionOverride?: string,
): Promise<void>
```

Responsibilities:

- source extraction
- optional video download
- optional Gemini prompt build
- Gemini tab automation
- parsing options
- saving paused job state

### Stage B: post-selection

Function shape:

```ts
async function resumeFromDraftSelection(
  jobId: string,
  optionId: string,
): Promise<void>
```

Responsibilities:

- resolve selected draft text
- build final post payload
- open X
- upload media
- fill composer
- await review or auto-post

This split minimizes rework and keeps the pause/resume transition explicit.

## 9. Prompt Builder Contract

## 9.1 Input data

The prompt builder should operate on existing extracted source data plus settings.

Suggested input contract:

```ts
interface BuildGeminiPromptInput {
  sourceText: string;
  topic: string;
  tone: string;
  optionCount: number;
  maxChars: number;
}
```

## 9.2 Output format requirement

To reduce parser fragility, force Gemini to answer in a constrained text format:

```text
OPTION 1: ...
OPTION 2: ...
OPTION 3: ...
```

The parser should ignore extra blank lines and strip markdown bullets, numbering, and code fences if Gemini still adds them.

## 9.3 Prompt design rule

The prompt should request:

- same topic and intent
- different wording
- concise phrasing
- exact option count
- exact label format
- no preamble, no explanation

The prompt builder should not include any DOM or browser logic.

## 10. Gemini Content Script Contract

## 10.1 Readiness checks

The Gemini content script must detect these conditions before attempting input:

1. user is on a Gemini chat page
2. prompt input is present and editable
3. the page is not a login wall
4. the page is not showing a blocking consent or error overlay

On failure, return a normalized error string such as:

- `Gemini prompt input not found.`
- `Gemini requires sign-in.`
- `Gemini response did not complete before timeout.`

## 10.2 Input strategy

Prefer a robust insertion sequence similar to the X composer logic:

1. focus input
2. clear existing draft text
3. insert prompt text
4. verify visible value contains the prompt
5. trigger submit via button click or keyboard fallback

The insertion helper should dispatch realistic input/change events where needed.

## 10.3 Response completion heuristic

Generation should be considered complete only when all of the following are true:

1. at least one response block exists
2. the latest response block has non-empty text
3. known loading indicators are absent
4. the latest response text is stable across at least 2 polls

This is stricter than checking for visible text once and reduces false positives from streaming responses.

## 11. Popup UX Spec

## 11.1 New UI states in `src/popup/App.tsx`

When `job.phase === 'awaiting-draft-selection'` and `job.geminiResult?.options.length > 0`, show:

1. a section title such as `Generated Drafts`
2. one card per option
3. a `Use This Draft` button per option
4. optional raw prompt/response debug toggle in a collapsed area

## 11.2 Interaction contract

On click of `Use This Draft`:

1. disable all draft buttons
2. send `SELECT_GEMINI_DRAFT` with `jobId` and `optionId`
3. wait for background state update
4. transition back to normal running UI

## 11.3 Failure display

If Gemini generation fails, popup should surface the background error from `job.error` and keep the existing recovery-hint model.

## 12. Failure Modes

Expected failure classes:

1. Gemini tab opens but user is signed out
2. Prompt input selector fails after a Gemini UI update
3. Gemini returns a safety/refusal response instead of options
4. Response completes but parser finds zero valid options
5. Service worker unload happens while waiting for selection

Handling requirements:

- Persist all intermediate Gemini state in `saveLastJob()`.
- Treat zero parsed options as a hard failure with debug logs.
- Preserve raw response text when parsing fails.
- Keep the job resumable only from `awaiting-draft-selection`, not from partial DOM actions.

## 13. Testing Plan

## 13.1 Unit tests

Add unit tests for:

- `buildGeminiPrompt()`
- `parseGeminiDraftOptions()`
- settings normalization for Gemini fields

Suggested locations:

- `tests/unit/shared/gemini.test.ts`
- `tests/unit/background/storage.test.ts` updates if needed
- `tests/unit/shared/types.test.ts` if settings normalization is split there

## 13.2 Component tests

Add popup tests for:

- rendering generated draft options
- disabled state while selection request is in flight
- hidden state when no Gemini results exist

Suggested location:

- `tests/component/popup/App.test.tsx`

## 13.3 Characterization tests for content helpers

Where possible, keep DOM parsing logic isolated so selector and parser helpers can be tested with fixture HTML without requiring live Gemini.

## 13.4 Manual browser validation

Required manual validation checklist:

1. signed-in Gemini happy path
2. signed-out Gemini error path
3. timeout path when Gemini response is slow
4. malformed response path with no parsable options
5. selection resume path into X draft mode
6. persisted-state recovery while waiting for draft selection

## 14. Recommended Implementation Order

1. Add shared Gemini types, settings, and message contracts.
2. Add `src/shared/gemini.ts` prompt builder and parser with unit tests.
3. Add `src/background/gemini-session.ts`.
4. Add Gemini content script modules and manifest wiring.
5. Refactor `job-runner.ts` into pre-selection and post-selection stages.
6. Add popup draft-selection UI.
7. Run build and targeted tests.
8. Perform manual browser validation with a logged-in Gemini session.

## 15. Non-Goals For First Iteration

The first implementation should explicitly avoid:

- multiple Gemini prompts per job
- automatic retry loops against Gemini UI failures
- conversation history reuse across jobs
- auto-selection of a Gemini option
- direct auto-quote posting without popup review

Keeping the first iteration narrow will reduce fragility and make browser-truth validation easier.