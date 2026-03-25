// ---------------------------------------------------------------------------
// storage.ts — chrome.storage.local wrapper
// ---------------------------------------------------------------------------

import type { JobState, UserSettings } from '@shared/types';
import { normalizeUserSettings } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';

function ensureJobTimestamps(job: JobState): JobState {
  const fallbackIso = new Date().toISOString();
  return {
    ...job,
    createdAt: job.createdAt ?? fallbackIso,
    updatedAt: job.updatedAt ?? job.createdAt ?? fallbackIso,
  };
}

/** Load user settings, falling back to defaults. */
export async function loadSettings(): Promise<UserSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return normalizeUserSettings(result[STORAGE_KEYS.SETTINGS] as Partial<UserSettings> | undefined);
}

/** Persist user settings. */
export async function saveSettings(
  settings: Partial<UserSettings>,
): Promise<UserSettings> {
  const current = await loadSettings();
  const nextSettings = normalizeUserSettings({ ...current, ...settings });
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: nextSettings,
  });

  return nextSettings;
}

/** Persist the latest job state for popup recovery. */
export async function saveLastJob(job: JobState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_JOB]: ensureJobTimestamps(job) });
}

/** Load the last known job state. */
export async function loadLastJob(): Promise<JobState | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_JOB);
  const job = (result[STORAGE_KEYS.LAST_JOB] as JobState | undefined) ?? null;
  return job ? ensureJobTimestamps(job) : null;
}

/** Append a completed job summary to history (capped at 50 entries). */
export async function appendJobHistory(job: JobState): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.JOB_HISTORY);
  const history: JobState[] = (result[STORAGE_KEYS.JOB_HISTORY] as JobState[]) ?? [];
  history.unshift(ensureJobTimestamps(job));
  if (history.length > 50) history.length = 50;
  await chrome.storage.local.set({ [STORAGE_KEYS.JOB_HISTORY]: history });
}

/** Load recent job history for the popup. */
export async function loadJobHistory(): Promise<JobState[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.JOB_HISTORY);
  const history = (result[STORAGE_KEYS.JOB_HISTORY] as JobState[] | undefined) ?? [];
  return history.map(ensureJobTimestamps);
}
