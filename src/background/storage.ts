// ---------------------------------------------------------------------------
// storage.ts — chrome.storage.local wrapper
// ---------------------------------------------------------------------------

import type { JobState, UserSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';

/** Load user settings, falling back to defaults. */
export async function loadSettings(): Promise<UserSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] ?? {}) };
}

/** Persist user settings. */
export async function saveSettings(
  settings: Partial<UserSettings>,
): Promise<void> {
  const current = await loadSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}

/** Persist the latest job state for popup recovery. */
export async function saveLastJob(job: JobState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_JOB]: job });
}

/** Load the last known job state. */
export async function loadLastJob(): Promise<JobState | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_JOB);
  return (result[STORAGE_KEYS.LAST_JOB] as JobState) ?? null;
}

/** Append a completed job summary to history (capped at 50 entries). */
export async function appendJobHistory(job: JobState): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.JOB_HISTORY);
  const history: JobState[] = (result[STORAGE_KEYS.JOB_HISTORY] as JobState[]) ?? [];
  history.unshift(job);
  if (history.length > 50) history.length = 50;
  await chrome.storage.local.set({ [STORAGE_KEYS.JOB_HISTORY]: history });
}
