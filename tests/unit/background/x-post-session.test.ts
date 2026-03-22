import { describe, expect, it, vi } from 'vitest';

import type { ComposeEvidence } from '@shared/types';
import type { XActionResultMessage } from '@shared/messages';
import {
  evaluatePostEligibility,
  runXPostSession,
} from '@background/x-post-session';

// ---------------------------------------------------------------------------
// evaluatePostEligibility — pure decision function
// ---------------------------------------------------------------------------

describe('evaluatePostEligibility', () => {
  it('returns draft-review for prepare-draft mode regardless of evidence', () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'submit-ready',
      targetSelector: 'x',
      insertionStrategy: 'execCommand-insertText',
      visibleText: 'ok',
      visibleMatchesExpected: true,
    };
    expect(evaluatePostEligibility(evidence, 'prepare-draft')).toBe('draft-review');
  });

  it('returns post when no evidence (backward compat)', () => {
    expect(evaluatePostEligibility(undefined, 'auto-post')).toBe('post');
  });

  it('returns post for submit-ready evidence', () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'submit-ready',
      targetSelector: 'x',
      insertionStrategy: 'execCommand-insertText',
      visibleText: 'ok',
      visibleMatchesExpected: true,
    };
    expect(evaluatePostEligibility(evidence, 'auto-post')).toBe('post');
  });

  it('returns draft-review for draft-ready evidence', () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'draft-ready',
      targetSelector: 'x',
      insertionStrategy: 'execCommand-insertText',
      visibleText: 'ok',
      visibleMatchesExpected: true,
    };
    expect(evaluatePostEligibility(evidence, 'auto-post')).toBe('draft-review');
  });

  it('returns draft-review for visible-only evidence', () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'visible-only',
      targetSelector: 'x',
      insertionStrategy: 'execCommand-insertText',
      visibleText: 'some text',
      visibleMatchesExpected: false,
    };
    expect(evaluatePostEligibility(evidence, 'auto-post')).toBe('draft-review');
  });

  it('returns fail for proof-failed evidence', () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'proof-failed',
      targetSelector: 'x',
      insertionStrategy: 'execCommand-insertText',
      visibleText: '',
      visibleMatchesExpected: false,
      errorDetail: 'empty',
    };
    expect(evaluatePostEligibility(evidence, 'auto-post')).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// runXPostSession — integration with mocked deps
// ---------------------------------------------------------------------------

function makeDeps() {
  return {
    sendToTab: vi.fn(),
    log: vi.fn(),
    onPhaseChange: vi.fn(),
  };
}

describe('runXPostSession', () => {
  it('posts when compose returns submit-ready evidence', async () => {
    const deps = makeDeps();
    deps.sendToTab
      .mockResolvedValueOnce({
        action: 'X_ACTION_RESULT',
        step: 'compose',
        success: true,
        evidence: {
          proofStatus: 'submit-ready',
          targetSelector: 'x',
          insertionStrategy: 'execCommand-insertText',
          visibleText: 'hello',
          visibleMatchesExpected: true,
        },
      } satisfies XActionResultMessage)
      .mockResolvedValueOnce({
        action: 'X_ACTION_RESULT',
        step: 'post',
        success: true,
      } satisfies XActionResultMessage);

    const result = await runXPostSession(42, 'hello', 'auto-post', true, deps);

    expect(result).toEqual({ result: 'posted' });
    expect(deps.sendToTab).toHaveBeenCalledTimes(2);
    expect(deps.onPhaseChange).toHaveBeenCalledWith('posting');
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining('Visible verification [proof]: status=submit-ready'),
    );
    expect(deps.log).toHaveBeenCalledWith(
      'Submit gate [gating]: mode=auto-post decision=post proof=submit-ready',
    );
  });

  it('stops at draft when evidence is visible-only', async () => {
    const deps = makeDeps();
    deps.sendToTab.mockResolvedValueOnce({
      action: 'X_ACTION_RESULT',
      step: 'compose',
      success: true,
      evidence: {
        proofStatus: 'visible-only',
        targetSelector: 'x',
        insertionStrategy: 'execCommand-insertText',
        visibleText: 'hello',
        visibleMatchesExpected: false,
      },
    } satisfies XActionResultMessage);

    const result = await runXPostSession(42, 'hello', 'auto-post', true, deps);

    expect(result).toEqual({ result: 'awaiting-review' });
    expect(deps.sendToTab).toHaveBeenCalledTimes(1);
    expect(deps.onPhaseChange).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      'Submit gate [gating]: mode=auto-post decision=draft-review proof=visible-only',
    );
    expect(deps.log).toHaveBeenCalledWith(
      'Submit gate held draft: proof status "visible-only" is below auto-post threshold.',
    );
  });

  it('throws on proof-failed evidence with proof-layer detail', async () => {
    const deps = makeDeps();
    deps.sendToTab.mockResolvedValueOnce({
      action: 'X_ACTION_RESULT',
      step: 'compose',
      success: true,
      evidence: {
        proofStatus: 'proof-failed',
        targetSelector: 'x',
        insertionStrategy: 'execCommand-insertText',
        visibleText: '',
        visibleMatchesExpected: false,
        errorDetail: 'empty',
      },
    } satisfies XActionResultMessage);

    await expect(
      runXPostSession(42, 'hello', 'auto-post', true, deps),
    ).rejects.toThrow('X submit gate rejected proof layer: proof-failed — empty');
    expect(deps.log).toHaveBeenCalledWith('Proof detail [proof]: empty');
    expect(deps.log).toHaveBeenCalledWith(
      'Submit gate [gating]: mode=auto-post decision=fail proof=proof-failed',
    );
  });

  it('returns awaiting-review for prepare-draft mode even with submit-ready', async () => {
    const deps = makeDeps();
    deps.sendToTab.mockResolvedValueOnce({
      action: 'X_ACTION_RESULT',
      step: 'compose',
      success: true,
      evidence: {
        proofStatus: 'submit-ready',
        targetSelector: 'x',
        insertionStrategy: 'execCommand-insertText',
        visibleText: 'hello',
        visibleMatchesExpected: true,
      },
    } satisfies XActionResultMessage);

    const result = await runXPostSession(42, 'hello', 'prepare-draft', true, deps);

    expect(result).toEqual({ result: 'awaiting-review' });
    expect(deps.sendToTab).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith(
      'Submit gate [gating]: mode=prepare-draft decision=draft-review proof=submit-ready',
    );
  });

  it('posts when no evidence is returned (backward compat)', async () => {
    const deps = makeDeps();
    deps.sendToTab
      .mockResolvedValueOnce({
        action: 'X_ACTION_RESULT',
        step: 'compose',
        success: true,
      } satisfies XActionResultMessage)
      .mockResolvedValueOnce({
        action: 'X_ACTION_RESULT',
        step: 'post',
        success: true,
      } satisfies XActionResultMessage);

    const result = await runXPostSession(42, 'hello', 'auto-post', false, deps);

    expect(result).toEqual({ result: 'posted' });
    expect(deps.log).toHaveBeenCalledWith(
      'Visible verification [proof]: no structured evidence returned; using backward-compatible success path.',
    );
  });

  it('throws selector/login layer error when compose reports not logged in', async () => {
    const deps = makeDeps();
    deps.sendToTab.mockResolvedValueOnce({
      action: 'X_ACTION_RESULT',
      step: 'compose',
      success: false,
      error: 'Not logged in',
    } satisfies XActionResultMessage);

    await expect(
      runXPostSession(42, 'hello', 'auto-post', true, deps),
    ).rejects.toThrow('X compose failed at selector/login gate: Not logged in');
    expect(deps.log).toHaveBeenCalledWith('Compose failure [compose]: Not logged in');
  });

  it('throws insertion layer error for generic compose failure', async () => {
    const deps = makeDeps();
    deps.sendToTab.mockResolvedValueOnce({
      action: 'X_ACTION_RESULT',
      step: 'compose',
      success: false,
      error: 'Input event dispatch failed',
    } satisfies XActionResultMessage);

    await expect(
      runXPostSession(42, 'hello', 'auto-post', true, deps),
    ).rejects.toThrow('X compose failed at insertion layer: Input event dispatch failed');
  });
});
