// ---------------------------------------------------------------------------
// background/index.ts — service worker entry point
// ---------------------------------------------------------------------------

import type { RuntimeMessage } from '@shared/messages';
import { startJob, cancelJob, getCurrentJob, appendRuntimeLog } from './job-runner';

// ---------------------------------------------------------------------------
// Side panel — open when the extension icon is clicked
// ---------------------------------------------------------------------------

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    switch (message.action) {
      case 'START_JOB': {
        // Run asynchronously; respond immediately so the port stays open
        startJob(message.sourceUrl, message.mode, message.captionOverride)
          .catch((err) => {
            console.error('[bg] startJob error', err);
          });
        sendResponse({ ack: true });
        break;
      }

      case 'CANCEL_JOB': {
        cancelJob();
        sendResponse({ ack: true });
        break;
      }

      case 'GET_JOB_STATE': {
        sendResponse({ state: getCurrentJob() });
        break;
      }

      case 'LOG': {
        appendRuntimeLog(message.text);
        sendResponse({ ack: true });
        break;
      }

      default:
        break;
    }

    // Return true to indicate async sendResponse if needed
    return true;
  },
);

// ---------------------------------------------------------------------------
// Service worker lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CrossPost] Extension installed / updated.');
});
