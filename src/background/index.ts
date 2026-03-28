// ---------------------------------------------------------------------------
// background/index.ts — service worker entry point
// ---------------------------------------------------------------------------

import type { RuntimeMessage } from '@shared/messages';
import { SCHEDULER_ALARM_NAME } from '@shared/constants';
import { getNextReadyEntry } from '@shared/schedule';
import { startJob, cancelJob, getCurrentJob, appendRuntimeLog } from './job-runner';
import { loadJobHistory, loadLastJob, loadSettings, saveSettings } from './storage';
import { addToQueue, clearFinishedEntries, loadQueue, removeFromQueue, setEntryStatus } from './job-queue';
import { setNextAlarm } from './alarm-manager';

function isLiveRunningState(phase: string): boolean {
  return phase !== 'idle' && phase !== 'completed' && phase !== 'failed';
}

// ---------------------------------------------------------------------------
// Queue broadcast — notify all popup/side-panel ports of updated queue state
// ---------------------------------------------------------------------------

export async function broadcastQueueUpdate(): Promise<void> {
  const entries = await loadQueue();
  chrome.runtime.sendMessage({ action: 'QUEUE_UPDATE', entries }).catch(() => {
    // Popup may not be open — ignore "no receivers" error
  });
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

      case 'ADD_TO_QUEUE': {
        addToQueue(message.entry)
          .then(async (entry) => {
            const entries = await loadQueue();
            await setNextAlarm(entries);
            sendResponse({ entry });
            broadcastQueueUpdate().catch(() => {});
          })
          .catch((error) => {
            console.error('[bg] addToQueue error', error);
            sendResponse({ entry: null, error: 'Failed to add to queue' });
          });
        break;
      }

      case 'REMOVE_FROM_QUEUE': {
        removeFromQueue(message.id)
          .then(async () => {
            const entries = await loadQueue();
            await setNextAlarm(entries);
            sendResponse({ ack: true });
            broadcastQueueUpdate().catch(() => {});
          })
          .catch((error) => {
            console.error('[bg] removeFromQueue error', error);
            sendResponse({ ack: false, error: 'Failed to remove from queue' });
          });
        break;
      }

      case 'CANCEL_QUEUE_ENTRY': {
        (async () => {
          try {
            const entries = await loadQueue();
            const entry = entries.find((e) => e.id === message.id);
            if (!entry) {
              sendResponse({ ack: true }); // no-op for unknown id
              return;
            }

            if (entry.status === 'pending') {
              await setEntryStatus(message.id, 'cancelled');
              const updated = await loadQueue();
              await setNextAlarm(updated);
              sendResponse({ ack: true });
              broadcastQueueUpdate().catch(() => {});
            } else if (entry.status === 'running') {
              cancelJob();
              await setEntryStatus(message.id, 'cancelled');
              const updated = await loadQueue();
              await setNextAlarm(updated);
              sendResponse({ ack: true });
              broadcastQueueUpdate().catch(() => {});
            } else {
              // already finished — no-op
              sendResponse({ ack: true });
            }
          } catch (error) {
            console.error('[bg] cancelQueueEntry error', error);
            sendResponse({ ack: false, error: 'Failed to cancel queue entry' });
          }
        })();
        break;
      }

      case 'CLEAR_FINISHED_QUEUE': {
        clearFinishedEntries()
          .then(async () => {
            sendResponse({ ack: true });
            broadcastQueueUpdate().catch(() => {});
          })
          .catch((error) => {
            console.error('[bg] clearFinishedQueue error', error);
            sendResponse({ ack: false, error: 'Failed to clear finished queue' });
          });
        break;
      }

      case 'GET_QUEUE': {
        loadQueue()
          .then((entries) => sendResponse({ entries }))
          .catch((error) => {
            console.error('[bg] loadQueue error', error);
            sendResponse({ entries: [], error: 'Failed to load queue' });
          });
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

// ---------------------------------------------------------------------------
// Alarm listener — wakes service worker to run the next scheduled job
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SCHEDULER_ALARM_NAME) return;

  (async () => {
    try {
      const entries = await loadQueue();
      const entry = getNextReadyEntry(entries, Date.now());

      if (!entry) {
        // Nothing ready — re-arm for the next pending entry if any
        await setNextAlarm(entries);
        return;
      }

      // Guard: don't start if a job is already running
      const current = getCurrentJob();
      if (current && current.phase !== 'idle' && current.phase !== 'completed' && current.phase !== 'failed') {
        console.log('[scheduler] job already running, alarm will re-fire after current job completes');
        // Re-arm for this entry (it remains pending)
        await setNextAlarm(entries);
        return;
      }

      await setEntryStatus(entry.id, 'running');
      await broadcastQueueUpdate();
      console.log(`[scheduler] firing job ${entry.id} scheduled for ${entry.scheduledAt}`);

      await startJob(entry.sourceUrl, entry.mode, entry.captionOverride);
    } catch (err) {
      console.error('[scheduler] alarm handler error', err);
    }
  })();
});
