// ---------------------------------------------------------------------------
// x-post-session.ts — X posting session: compose, verify evidence, post
//
// Extracted from job-runner.ts to centralize compose/post eligibility
// decisions. The job-runner calls `runXPostSession()` as a single
// high-level orchestration step for Phases 7+8.
// ---------------------------------------------------------------------------

import type { XActionResultMessage } from '@shared/messages';
import type { ComposeEvidence, JobPhase, RunMode } from '@shared/types';
import { isSubmitEligible, isDraftEligible } from '@shared/types';
import { ExtensionError } from '@shared/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XPostSessionDeps {
  sendToTab: <T>(tabId: number, message: Record<string, unknown>) => Promise<T>;
  log: (text: string) => void;
  onPhaseChange?: (phase: JobPhase) => void;
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

function logVisibleVerification(
  evidence: ComposeEvidence | undefined,
  log: (text: string) => void,
): void {
  if (!evidence) {
    log('Visible verification [proof]: no structured evidence returned; using backward-compatible success path.');
    return;
  }

  log(
    `Visible verification [proof]: status=${evidence.proofStatus} ` +
      `selector=${evidence.targetSelector} ` +
      `match=${evidence.visibleMatchesExpected ? 'yes' : 'no'} ` +
      `chars=${evidence.visibleText.length}`,
  );

  if (evidence.errorDetail) {
    log(`Proof detail [proof]: ${evidence.errorDetail}`);
  }
}

function logSubmitGate(
  decision: 'post' | 'draft-review' | 'fail',
  mode: RunMode,
  evidence: ComposeEvidence | undefined,
  log: (text: string) => void,
): void {
  log(
    `Submit gate [gating]: mode=${mode} decision=${decision} ` +
      `proof=${evidence?.proofStatus ?? 'none'}`,
  );
}

function buildComposeFailure(
  composeResult: XActionResultMessage,
): ExtensionError {
  const rawError = composeResult.error ?? 'Composer fill failed';

  if (composeResult.evidence?.errorDetail) {
    return new ExtensionError(
      `X compose failed at proof layer: ${composeResult.evidence.errorDetail}`,
      'X_COMPOSER_NOT_FOUND',
      true,
    );
  }

  if (/not logged in/i.test(rawError)) {
    return new ExtensionError(
      `X compose failed at selector/login gate: ${rawError}`,
      'X_LOGIN_MISSING',
      true,
    );
  }

  if (/not found|composer/i.test(rawError)) {
    return new ExtensionError(
      `X compose failed at selector layer: ${rawError}`,
      'X_COMPOSER_NOT_FOUND',
      true,
    );
  }

  return new ExtensionError(
    `X compose failed at insertion layer: ${rawError}`,
    'X_COMPOSER_NOT_FOUND',
    true,
  );
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
  const { sendToTab, log, onPhaseChange } = deps;

  // ---- Compose ----
  log(hasMedia ? 'Typing caption after media upload…' : 'Filling composer…');

  const composeResult = await sendToTab<XActionResultMessage>(xTabId, {
    action: 'COMPOSE_POST',
    text: postText,
  });

  if (!composeResult.success) {
    log(`Compose failure [compose]: ${composeResult.error ?? 'Composer fill failed'}`);
    if (composeResult.evidence?.errorDetail) {
      log(`Proof detail [proof]: ${composeResult.evidence.errorDetail}`);
    }
    throw buildComposeFailure(composeResult);
  }

  log(hasMedia ? 'Caption typed after media upload.' : 'Text inserted into composer.');
  logVisibleVerification(composeResult.evidence, log);

  // ---- Evaluate eligibility from evidence ----
  const decision = evaluatePostEligibility(composeResult.evidence, mode);
  logSubmitGate(decision, mode, composeResult.evidence, log);

  if (decision === 'draft-review') {
    log(
      mode === 'prepare-draft'
        ? 'Draft ready — review and post manually when ready.'
        : `Submit gate held draft: proof status "${composeResult.evidence?.proofStatus}" is below auto-post threshold.`,
    );
    return { result: 'awaiting-review' };
  }

  if (decision === 'fail') {
    const proofStatus = composeResult.evidence?.proofStatus ?? 'unknown';
    const errorDetail = composeResult.evidence?.errorDetail;
    throw new ExtensionError(
      errorDetail
        ? `X submit gate rejected proof layer: ${proofStatus} — ${errorDetail}`
        : `X submit gate rejected proof layer: ${proofStatus}`,
      'X_COMPOSER_NOT_FOUND',
      true,
    );
  }

  // ---- Post ----
  onPhaseChange?.('posting');
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
