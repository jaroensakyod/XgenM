// ---------------------------------------------------------------------------
// background/index.ts — service worker entry point
// ---------------------------------------------------------------------------

import type { RuntimeMessage } from '@shared/messages';
import { startJob, cancelJob, getCurrentJob, appendRuntimeLog } from './job-runner';
import { loadJobHistory, loadLastJob, loadSettings, saveSettings } from './storage';

function isLiveRunningState(phase: string): boolean {
  return phase !== 'idle' && phase !== 'completed' && phase !== 'failed';
}

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
        const currentJob = getCurrentJob();
        if (currentJob) {
          sendResponse({
            state: currentJob,
            source: isLiveRunningState(currentJob.phase) ? 'live' : 'persisted',
          });
          break;
        }

        loadLastJob()
          .then((job) => {
            sendResponse({
              state: job,
              source: job ? 'persisted' : 'none',
            });
          })
          .catch((error) => {
            console.error('[bg] loadLastJob error', error);
            sendResponse({ state: null, source: 'none' });
          });
        break;
      }

      case 'GET_SETTINGS': {
        loadSettings()
          .then((settings) => sendResponse({ settings }))
          .catch((error) => {
            console.error('[bg] loadSettings error', error);
            sendResponse({ settings: null, error: 'Failed to load settings' });
          });
        break;
      }

      case 'SAVE_SETTINGS': {
        saveSettings(message.settings)
          .then((settings) => sendResponse({ settings }))
          .catch((error) => {
            console.error('[bg] saveSettings error', error);
            sendResponse({ settings: null, error: 'Failed to save settings' });
          });
        break;
      }

      case 'GET_JOB_HISTORY': {
        loadJobHistory()
          .then((history) => sendResponse({ history }))
          .catch((error) => {
            console.error('[bg] loadJobHistory error', error);
            sendResponse({ history: [], error: 'Failed to load job history' });
          });
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
