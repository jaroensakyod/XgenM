// ---------------------------------------------------------------------------
// composer-proof.ts — Compose verification and evidence classification
// ---------------------------------------------------------------------------

import type { ComposeEvidence, ComposeProofStatus } from '@shared/types';
import { sleep, waitForAnySelector } from '@shared/timing';
import { POST_BUTTON_SELECTORS } from './selectors';
import { findBestComposer } from './composer-target';
import {
  applyComposerTextInsertion,
  normalizeComposerText,
  matchesExpectedComposerText,
} from './composer-write';

function debugLog(text: string): void {
  chrome.runtime.sendMessage({
    action: 'LOG',
    text: `[x] ${text}`,
    phase: 'filling-composer',
  }).catch(() => {});
}

async function readComposerText(): Promise<string> {
  const match = await findBestComposer();
  const raw = match.element.innerText || match.element.textContent || '';
  const normalized = normalizeComposerText(raw);
  debugLog(`Read composer text sample: "${normalized.slice(0, 80)}"`);
  return normalized;
}

function isPostButtonEnabled(button: HTMLElement): boolean {
  return button.getAttribute('aria-disabled') !== 'true'
    && button.getAttribute('data-disabled') !== 'true'
    && !(button as HTMLButtonElement).disabled;
}

async function getPostButtonState(): Promise<{
  enabled: boolean;
  selector: string;
}> {
  const match = await waitForAnySelector<HTMLElement>(POST_BUTTON_SELECTORS, 1_500);

  if (!match) {
    return {
      enabled: false,
      selector: 'none',
    };
  }

  return {
    enabled: isPostButtonEnabled(match.element),
    selector: match.selector,
  };
}

export async function ensureComposerText(
  text: string,
  maxAttempts = 3,
): Promise<ComposeEvidence> {
  let lastSelector = 'unknown';
  let lastVisibleText = '';
  let lastPostButtonSelector = 'none';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    debugLog(`Ensuring caption is present (attempt ${attempt}/${maxAttempts}).`);

    const match = await findBestComposer();
    lastSelector = match.selector;
    await applyComposerTextInsertion(match.element, text);
    await sleep(500);

    const actual = await readComposerText();
    lastVisibleText = actual;
    debugLog(`Composer now has ${actual.length} normalized chars.`);

    if (matchesExpectedComposerText(actual, text)) {
      const postButtonState = await getPostButtonState();
      lastPostButtonSelector = postButtonState.selector;
      debugLog(
        `Post button state after typing: ${
          postButtonState.enabled ? 'enabled' : 'disabled'
        } via ${postButtonState.selector}.`,
      );

      if (postButtonState.enabled) {
        debugLog('Caption verification succeeded with submit-ready state.');
        return {
          proofStatus: 'submit-ready' as ComposeProofStatus,
          targetSelector: lastSelector,
          insertionStrategy: 'execCommand-insertText',
          visibleText: actual,
          visibleMatchesExpected: true,
        };
      }

      if (attempt < maxAttempts) {
        debugLog('Caption is visible but post button is not ready yet; clearing and retrying.');
        continue;
      }

      debugLog('Caption verification succeeded, but submit state stayed disabled.');
      return {
        proofStatus: 'draft-ready' as ComposeProofStatus,
        targetSelector: lastSelector,
        insertionStrategy: 'execCommand-insertText',
        visibleText: actual,
        visibleMatchesExpected: true,
        errorDetail: `Post button stayed disabled after ${maxAttempts} attempts (selector: ${lastPostButtonSelector}).`,
      };
    }
  }

  const actual = await readComposerText();
  lastVisibleText = actual;

  if (lastVisibleText.length > 0) {
    return {
      proofStatus: 'visible-only' as ComposeProofStatus,
      targetSelector: lastSelector,
      insertionStrategy: 'execCommand-insertText',
      visibleText: lastVisibleText,
      visibleMatchesExpected: false,
      errorDetail: `Caption verification failed. Final composer text: ${lastVisibleText.slice(0, 80)}`,
    };
  }

  return {
    proofStatus: 'proof-failed' as ComposeProofStatus,
    targetSelector: lastSelector,
    insertionStrategy: 'execCommand-insertText',
    visibleText: '',
    visibleMatchesExpected: false,
    errorDetail: `Caption verification failed. Composer empty after ${maxAttempts} attempts.`,
  };
}
