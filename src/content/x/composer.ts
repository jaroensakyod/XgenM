// ---------------------------------------------------------------------------
// composer.ts — X content script entry point: message listener
//
// Decomposed modules:
//   composer-target.ts  — DOM target discovery and scoring
//   composer-write.ts   — Text insertion and normalization
//   composer-proof.ts   — Compose verification and evidence
//   composer-submit.ts  — Post button interaction
// ---------------------------------------------------------------------------

import type {
  RuntimeMessage,
  XActionResultMessage,
  ComposePostMessage,
  UploadMediaMessage,
} from '@shared/messages';
import type { ComposeEvidence } from '@shared/types';
import { LOGIN_WALL_SELECTORS } from './selectors';
import { attachMedia, waitForUploadComplete } from './upload';
import { ensureComposerText } from './composer-proof';
import { clickPost } from './composer-submit';

// Re-export decomposed modules for backward-compatible test imports
export {
  isVisibleComposer,
  resolveEditableComposer,
  scoreComposer,
} from './composer-target';
export {
  normalizeComposerText,
  matchesExpectedComposerText,
  applyComposerTextInsertion,
} from './composer-write';
export type { ComposerInsertionRuntime, InsertionResult } from './composer-write';

function debugLog(text: string): void {
  chrome.runtime.sendMessage({
    action: 'LOG',
    text: `[x] ${text}`,
    phase: 'filling-composer',
  }).catch(() => {});
}

function isLoggedIn(): boolean {
  return !LOGIN_WALL_SELECTORS.some(
    (sel) => document.querySelector(sel) !== null,
  );
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
      evidence?: ComposeEvidence,
    ) => {
      const result: XActionResultMessage = {
        action: 'X_ACTION_RESULT',
        step,
        success,
        error,
        evidence,
      };
      sendResponse(result);
    };

    switch (message.action) {
      // --- Fill text into composer ---
      case 'COMPOSE_POST': {
        const { text } = message as ComposePostMessage;

        if (!isLoggedIn()) {
          respond('compose', false, 'Not logged in to X.', {
            proofStatus: 'proof-failed',
            targetSelector: 'none',
            insertionStrategy: 'failed',
            visibleText: '',
            visibleMatchesExpected: false,
            errorDetail: 'Not logged in to X.',
          });
          return true;
        }

        ensureComposerText(text)
          .then((evidence) => {
            const success = evidence.proofStatus !== 'proof-failed';
            respond(
              'compose',
              success,
              success ? undefined : evidence.errorDetail,
              evidence,
            );
          })
          .catch((err) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            debugLog(`Caption compose failed: ${errorMsg}`);
            respond('compose', false, errorMsg, {
              proofStatus: 'proof-failed',
              targetSelector: 'unknown',
              insertionStrategy: 'failed',
              visibleText: '',
              visibleMatchesExpected: false,
              errorDetail: errorMsg,
            });
          });
        return true;
      }

      // --- Upload media ---
      case 'UPLOAD_MEDIA': {
        const { videoDataUrl, fileName } = message as UploadMediaMessage;

        debugLog(`Received upload request for ${fileName} (${Math.round(videoDataUrl.length / 1024)} KiB data URL).`);

        attachMedia(videoDataUrl, fileName)
          .then(() => waitForUploadComplete())
          .then((result) => {
            if (result.completed) {
              debugLog('X upload flow reported success.');
              respond('upload', true);
            } else {
              debugLog(`X upload flow timed out without success indicator: ${result.detail}`);
              respond('upload', false, `Upload timed out. ${result.detail}`);
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
          .catch((err) => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            debugLog(`Post click failed: ${errorMsg}`);
            respond('post', false, errorMsg);
          });
        return true;
      }

      default:
        return false;
    }
  },
);

console.log('[CrossPost] X content script loaded.');
