// ---------------------------------------------------------------------------
// composer.ts — X content script: compose text, upload media, click post
// ---------------------------------------------------------------------------

import type {
  RuntimeMessage,
  XActionResultMessage,
  ComposePostMessage,
  UploadMediaMessage,
} from '@shared/messages';
import { waitForAnySelector, sleep } from '@shared/timing';
import { ACTION_DELAY } from '@shared/constants';
import {
  COMPOSER_TEXT_SELECTORS,
  POST_BUTTON_SELECTORS,
  LOGIN_WALL_SELECTORS,
} from './selectors';
import { attachMedia, waitForUploadComplete } from './upload';

function debugLog(text: string): void {
  chrome.runtime.sendMessage({
    action: 'LOG',
    text: `[x] ${text}`,
    phase: 'uploading-media',
  }).catch(() => {
    // Best-effort diagnostics only.
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLoggedIn(): boolean {
  return !LOGIN_WALL_SELECTORS.some(
    (sel) => document.querySelector(sel) !== null,
  );
}

function normalizeComposerText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVisibleComposer(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    el.getClientRects().length > 0;
}

function resolveEditableComposer(el: HTMLElement): HTMLElement | null {
  if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
    return el;
  }

  return el.querySelector<HTMLElement>(
    '[contenteditable="true"][role="textbox"], [contenteditable="true"], [role="textbox"]',
  );
}

function scoreComposer(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const area = rect.width * rect.height;
  const focused = document.activeElement === el || el.contains(document.activeElement);
  const editableBonus = el.isContentEditable ? 2_000_000 : 0;
  const textboxBonus = el.getAttribute('role') === 'textbox' ? 1_000_000 : 0;
  return area + editableBonus + textboxBonus + (focused ? 3_000_000 : 0);
}

async function findBestComposer(): Promise<{ element: HTMLElement; selector: string }> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const candidates: Array<{ element: HTMLElement; selector: string }> = [];

    for (const selector of COMPOSER_TEXT_SELECTORS) {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

      for (const element of elements) {
        const editable = resolveEditableComposer(element);
        if (!editable || !isVisibleComposer(editable)) continue;
        candidates.push({ element: editable, selector });
      }
    }

    if (candidates.length > 0) {
      const deduped = candidates.filter((candidate, index, list) =>
        list.findIndex((item) => item.element === candidate.element) === index,
      );

      deduped.sort((a, b) => scoreComposer(b.element) - scoreComposer(a.element));
      const best = deduped[0];
      debugLog(
        `Selected visible composer with selector ${best.selector} from ${deduped.length} candidate(s). ` +
          `editable=${best.element.isContentEditable} role=${best.element.getAttribute('role') ?? ''}`,
      );
      return best;
    }

    await sleep(300);
  }

  throw new Error('Composer text area not found.');
}

async function getComposerElement(): Promise<HTMLElement> {
  const match = await findBestComposer();
  return match.element;
}

async function readComposerText(): Promise<string> {
  const composer = await getComposerElement();
  const raw = composer.innerText || composer.textContent || '';
  const normalized = normalizeComposerText(raw);
  debugLog(`Read composer text sample: "${normalized.slice(0, 80)}"`);
  return normalized;
}

function matchesExpectedComposerText(actual: string, expected: string): boolean {
  const normalizedExpected = normalizeComposerText(expected);
  if (!normalizedExpected) return actual.length > 0;

  return actual === normalizedExpected || actual.includes(normalizedExpected);
}

function splitIntoTypingChunks(text: string): string[] {
  const matches = text.match(/\S+\s*|\n+/g);
  return matches && matches.length > 0 ? matches : [text];
}

/**
 * Insert text into X's contenteditable composer.
 * Dispatches the same input events the real UI would produce.
 */
async function insertText(text: string): Promise<void> {
  const el = await getComposerElement();
  el.focus();
  await sleep(200);

  // Use execCommand for broad contenteditable compatibility
  document.execCommand('selectAll', false);
  document.execCommand('delete', false);

  for (const chunk of splitIntoTypingChunks(text)) {
    document.execCommand('insertText', false, chunk);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: chunk }));
    await sleep(Math.min(220, Math.max(60, chunk.length * 18)));
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function ensureComposerText(text: string, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    debugLog(`Ensuring caption is present (attempt ${attempt}/${maxAttempts}).`);
    await insertText(text);
    await sleep(400);

    const actual = await readComposerText();
    debugLog(`Composer now has ${actual.length} normalized chars.`);

    if (matchesExpectedComposerText(actual, text)) {
      debugLog('Caption verification succeeded.');
      return;
    }
  }

  const actual = await readComposerText();
  throw new Error(
    `Caption verification failed. Expected text was not present in composer. Final composer text: ${actual.slice(0, 80)}`,
  );
}

/**
 * Click the Post / Tweet button.
 */
async function clickPost(): Promise<void> {
  await sleep(ACTION_DELAY);

  const match = await waitForAnySelector<HTMLElement>(
    POST_BUTTON_SELECTORS,
  );

  if (!match) {
    throw new Error('Post button not found.');
  }

  const button = match.element;

  // Check if button is disabled (e.g. upload still processing)
  if (
    button.getAttribute('aria-disabled') === 'true' ||
    (button as HTMLButtonElement).disabled
  ) {
    // Wait a bit and retry
    await sleep(2000);
    if (
      button.getAttribute('aria-disabled') === 'true' ||
      (button as HTMLButtonElement).disabled
    ) {
      throw new Error('Post button is disabled — upload may still be processing.');
    }
  }

  button.click();
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage & { action: string }, _sender, sendResponse) => {
    const respond = (
      step: XActionResultMessage['step'],
      success: boolean,
      error?: string,
    ) => {
      const result: XActionResultMessage = {
        action: 'X_ACTION_RESULT',
        step,
        success,
        error,
      };
      sendResponse(result);
    };

    switch (message.action) {
      // --- Fill text into composer ---
      case 'COMPOSE_POST': {
        const { text } = message as ComposePostMessage;

        if (!isLoggedIn()) {
          respond('compose', false, 'Not logged in to X.');
          return true;
        }

        ensureComposerText(text)
          .then(() => respond('compose', true))
          .catch((err) => {
            debugLog(`Caption compose failed: ${err instanceof Error ? err.message : String(err)}`);
            respond('compose', false, err instanceof Error ? err.message : String(err));
          });
        return true;
      }

      // --- Upload media ---
      case 'UPLOAD_MEDIA': {
        const { videoDataUrl, fileName } = message as UploadMediaMessage;

        debugLog(`Received upload request for ${fileName} (${Math.round(videoDataUrl.length / 1024)} KiB data URL).`);

        attachMedia(videoDataUrl, fileName)
          .then(() => waitForUploadComplete())
          .then((completed) => {
            if (completed) {
              debugLog('X upload flow reported success.');
              respond('upload', true);
            } else {
              debugLog('X upload flow timed out without success indicator.');
              respond('upload', false, 'Upload timed out.');
            }
          })
          .catch((err) => {
            debugLog(`X upload flow failed: ${err instanceof Error ? err.message : String(err)}`);
            respond('upload', false, err instanceof Error ? err.message : String(err));
          });
        return true;
      }

      // --- Click Post ---
      case 'CLICK_POST': {
        clickPost()
          .then(() => respond('post', true))
          .catch((err) =>
            respond('post', false, err instanceof Error ? err.message : String(err)),
          );
        return true;
      }

      default:
        return false;
    }
  },
);

console.log('[CrossPost] X content script loaded.');
