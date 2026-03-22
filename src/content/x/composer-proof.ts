// ---------------------------------------------------------------------------
// composer-proof.ts — Compose verification and evidence classification
// ---------------------------------------------------------------------------

import type { ComposeEvidence, ComposeProofStatus } from '@shared/types';
import { sleep } from '@shared/timing';
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

export async function ensureComposerText(
  text: string,
  maxAttempts = 3,
): Promise<ComposeEvidence> {
  let lastSelector = 'unknown';
  let lastVisibleText = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    debugLog(`Ensuring caption is present (attempt ${attempt}/${maxAttempts}).`);

    const match = await findBestComposer();
    lastSelector = match.selector;
    await applyComposerTextInsertion(match.element, text);
    await sleep(400);

    const actual = await readComposerText();
    lastVisibleText = actual;
    debugLog(`Composer now has ${actual.length} normalized chars.`);

    if (matchesExpectedComposerText(actual, text)) {
      debugLog('Caption verification succeeded.');
      return {
        proofStatus: 'draft-ready' as ComposeProofStatus,
        targetSelector: lastSelector,
        insertionStrategy: 'execCommand-insertText',
        visibleText: actual,
        visibleMatchesExpected: true,
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
