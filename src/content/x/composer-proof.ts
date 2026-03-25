// ---------------------------------------------------------------------------
// composer-proof.ts — Compose verification and evidence classification
// ---------------------------------------------------------------------------

import type { ComposeEvidence, ComposeProofStatus, InsertionStrategyLabel } from '@shared/types';
import { extractHashtags } from '@shared/text';
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

interface ComposerMatchResult {
  matched: boolean;
  mode: 'strict' | 'semantic' | 'failed';
  reasons: string[];
}

function normalizeSemanticFragment(value: string): string {
  return normalizeComposerText(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function extractSourceFragment(text: string): string {
  const sourceIndex = text.indexOf('Source:');
  if (sourceIndex === -1) return '';
  return normalizeSemanticFragment(text.slice(sourceIndex));
}

function stripSourceFragment(text: string): string {
  const sourceIndex = text.indexOf('Source:');
  if (sourceIndex === -1) return text;
  return normalizeSemanticFragment(text.slice(0, sourceIndex));
}

function buildCaptionProbes(captionBody: string): string[] {
  if (!captionBody) return [];
  if (captionBody.length <= 48) return [captionBody];

  const leadProbe = normalizeSemanticFragment(captionBody.slice(0, 24));
  const tailProbe = normalizeSemanticFragment(captionBody.slice(-24));
  return Array.from(new Set([leadProbe, tailProbe].filter(Boolean)));
}

export function matchComposerTextSemantically(
  actualText: string,
  expectedText: string,
): ComposerMatchResult {
  const actual = normalizeSemanticFragment(actualText);
  const expected = normalizeSemanticFragment(expectedText);

  if (!actual || !expected) {
    return {
      matched: false,
      mode: 'failed',
      reasons: ['empty-text'],
    };
  }

  if (matchesExpectedComposerText(actual, expected)) {
    return {
      matched: true,
      mode: 'strict',
      reasons: [],
    };
  }

  const expectedSource = extractSourceFragment(expected);
  const actualHashtags = new Set(extractHashtags(actual));
  const expectedHashtags = extractHashtags(expected);
  const captionBody = normalizeSemanticFragment(
    stripSourceFragment(expected)
      .replace(/#[\w\u0E00-\u0E7F]+/g, ' '),
  );
  const captionProbes = buildCaptionProbes(captionBody);
  const lengthFloor = Math.max(24, Math.floor(expected.length * 0.85));

  const reasons: string[] = [];

  if (expectedSource && !actual.includes(expectedSource)) {
    reasons.push('missing-source');
  }

  const missingHashtags = expectedHashtags.filter((tag) => !actualHashtags.has(tag));
  if (missingHashtags.length > 0) {
    reasons.push(`missing-hashtags:${missingHashtags.join(',')}`);
  }

  const missingCaptionProbes = captionProbes.filter((probe) => !actual.includes(probe));
  if (missingCaptionProbes.length > 0) {
    reasons.push('missing-caption-body');
  }

  if (actual.length < lengthFloor) {
    reasons.push(`too-short:${actual.length}<${lengthFloor}`);
  }

  if (reasons.length > 0) {
    return {
      matched: false,
      mode: 'failed',
      reasons,
    };
  }

  return {
    matched: true,
    mode: 'semantic',
    reasons: [],
  };
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
  maxAttempts = 2,
): Promise<ComposeEvidence> {
  let lastSelector = 'unknown';
  let lastVisibleText = '';
  let lastPostButtonSelector = 'none';
  let lastStrategy: InsertionStrategyLabel = 'failed';
  let lastMismatchReasons: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    debugLog(`Ensuring caption is present (attempt ${attempt}/${maxAttempts}).`);

    const match = await findBestComposer();
    lastSelector = match.selector;
    const result = await applyComposerTextInsertion(match.element, text);
    lastStrategy = result.strategy;
    debugLog(`Writer result: applied=${result.applied}, strategy=${result.strategy}`);
    await sleep(500);

    const actual = await readComposerText();
    lastVisibleText = actual;
    debugLog(`Composer now has ${actual.length} normalized chars.`);

    const matchResult = matchComposerTextSemantically(actual, text);

    if (matchResult.mode === 'semantic') {
      debugLog('Caption verification matched semantically after normalization/reorder tolerance.');
    }

    if (matchResult.matched) {
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
          insertionStrategy: lastStrategy,
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
        insertionStrategy: lastStrategy,
        visibleText: actual,
        visibleMatchesExpected: true,
        errorDetail:
          `Post button stayed disabled after ${maxAttempts} attempts ` +
          `(composer: ${lastSelector}, button: ${lastPostButtonSelector}, visibleChars: ${actual.length}).`,
      };
    }

    lastMismatchReasons = matchResult.reasons;
    if (matchResult.reasons.length > 0) {
      debugLog(`Caption proof mismatch reasons: ${matchResult.reasons.join('; ')}`);
    }
  }

  const actual = await readComposerText();
  lastVisibleText = actual;

  if (lastVisibleText.length > 0) {
    return {
      proofStatus: 'visible-only' as ComposeProofStatus,
      targetSelector: lastSelector,
      insertionStrategy: lastStrategy,
      visibleText: lastVisibleText,
      visibleMatchesExpected: false,
      errorDetail:
        `Caption verification failed${
          lastMismatchReasons.length > 0
            ? ` (${lastMismatchReasons.join('; ')})`
            : ''
        }. Final composer text: ${lastVisibleText.slice(0, 80)}`,
    };
  }

  return {
    proofStatus: 'proof-failed' as ComposeProofStatus,
    targetSelector: lastSelector,
    insertionStrategy: lastStrategy,
    visibleText: '',
    visibleMatchesExpected: false,
    errorDetail: `Caption verification failed. Composer empty after ${maxAttempts} attempts.`,
  };
}
