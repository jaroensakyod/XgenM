// ---------------------------------------------------------------------------
// x-post-session.ts — X posting session: compose, verify evidence, post
//
// Extracted from job-runner.ts to centralize compose/post eligibility
// decisions. The job-runner calls `runXPostSession()` as a single
// high-level orchestration step for Phases 7+8.
// ---------------------------------------------------------------------------

import type { XActionResultMessage } from '@shared/messages';
import type { ComposeEvidence, RunMode } from '@shared/types';
import { isSubmitEligible, isDraftEligible } from '@shared/types';
import { ExtensionError } from '@shared/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XPostSessionDeps {
  sendToTab: <T>(tabId: number, message: Record<string, unknown>) => Promise<T>;
  log: (text: string) => void;
}

export type XPostSessionOutcome =
  | { result: 'posted' }
  | { result: 'awaiting-review' }
  | { result: 'failed'; error: string };

// ---------------------------------------------------------------------------
// Evidence evaluation (pure)
// ---------------------------------------------------------------------------

export function evaluatePostEligibility(
  evidence: ComposeEvidence | undefined,
  mode: RunMode,
): 'post' | 'draft-review' | 'fail' {
  if (mode === 'prepare-draft') return 'draft-review';

  // Backward compatible: no evidence → trust compose success and post
  if (!evidence) return 'post';

  if (isSubmitEligible(evidence)) return 'post';
  if (isDraftEligible(evidence)) return 'draft-review';

  return 'fail';
}

// ---------------------------------------------------------------------------
// Session runner
// ---------------------------------------------------------------------------

export async function runXPostSession(
  xTabId: number,
  postText: string,
  mode: RunMode,
  hasMedia: boolean,
  deps: XPostSessionDeps,
): Promise<XPostSessionOutcome> {
  const { sendToTab, log } = deps;

  // ---- Compose ----
  log(hasMedia ? 'Typing caption after media upload…' : 'Filling composer…');

  const composeResult = await sendToTab<XActionResultMessage>(xTabId, {
    action: 'COMPOSE_POST',
    text: postText,
  });

  if (!composeResult.success) {
    throw new ExtensionError(
      composeResult.error ?? 'Composer fill failed',
      'X_COMPOSER_NOT_FOUND',
    );
  }

  if (composeResult.evidence) {
    log(
      `Compose proof: ${composeResult.evidence.proofStatus} ` +
      `(selector: ${composeResult.evidence.targetSelector}, ` +
      `visible: "${composeResult.evidence.visibleText.slice(0, 60)}")`,
    );
  }

  log(hasMedia ? 'Caption typed after media upload.' : 'Text inserted into composer.');

  // ---- Evaluate eligibility from evidence ----
  const decision = evaluatePostEligibility(composeResult.evidence, mode);

  if (decision === 'draft-review') {
    log(
      mode === 'prepare-draft'
        ? 'Draft ready — review and post manually when ready.'
        : `Proof status "${composeResult.evidence?.proofStatus}" insufficient for auto-post — stopping at draft review.`,
    );
    return { result: 'awaiting-review' };
  }

  if (decision === 'fail') {
    const proofStatus = composeResult.evidence?.proofStatus ?? 'unknown';
    throw new ExtensionError(
      `Compose proof failed: ${proofStatus}`,
      'X_COMPOSER_NOT_FOUND',
      true,
    );
  }

  // ---- Post ----
  log('Clicking Post…');

  const postResult = await sendToTab<XActionResultMessage>(xTabId, {
    action: 'CLICK_POST',
  });

  if (!postResult.success) {
    throw new ExtensionError(
      postResult.error ?? 'Post click failed',
      'POST_BUTTON_UNAVAILABLE',
      true,
    );
  }

  log('Posted successfully!');
  return { result: 'posted' };
}
