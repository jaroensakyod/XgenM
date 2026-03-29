// ---------------------------------------------------------------------------
// alarm-manager.ts — chrome.alarms wrapper for the job scheduler
// ---------------------------------------------------------------------------

import { SCHEDULER_ALARM_NAME } from '@shared/constants';
import { getNextPendingEntry, type QueueEntry } from '@shared/schedule';

// ---------------------------------------------------------------------------
// Set / Clear
// ---------------------------------------------------------------------------

/**
 * Inspect the queue and schedule a chrome alarm for the next pending entry.
 * If no pending entries exist, any existing alarm is cleared.
 *
 * This must be called:
 *   - After a job completes or fails (to schedule the next one)
 *   - After a new entry is added to the queue
 *   - On extension startup (to recover after service worker sleep)
 */
export async function setNextAlarm(entries: QueueEntry[]): Promise<void> {
  const next = getNextPendingEntry(entries);

  if (!next) {
    await clearSchedulerAlarm();
    return;
  }

  const scheduledMs = new Date(next.scheduledAt).getTime();
  const nowMs = Date.now();

  // Fire immediately if scheduled time has already passed
  const whenMs = Math.max(scheduledMs, nowMs + 100);

  // chrome.alarms.create replaces any existing alarm with the same name
  chrome.alarms.create(SCHEDULER_ALARM_NAME, { when: whenMs });
}

/** Clear the scheduler alarm without affecting the queue. */
export async function clearSchedulerAlarm(): Promise<void> {
  await chrome.alarms.clear(SCHEDULER_ALARM_NAME);
}

/** Get the current scheduler alarm, or null if none is set. */
export async function getSchedulerAlarm(): Promise<chrome.alarms.Alarm | undefined> {
  return chrome.alarms.get(SCHEDULER_ALARM_NAME);
}
