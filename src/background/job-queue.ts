// ---------------------------------------------------------------------------
// job-queue.ts — Persistent queue CRUD via chrome.storage.local
// ---------------------------------------------------------------------------

import { STORAGE_KEYS } from '@shared/constants';
import {
  createQueueEntry,
  patchEntry,
  type NewQueueEntryInput,
  type QueueEntry,
  type QueueEntryStatus,
} from '@shared/schedule';

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/** Load all queue entries from storage. Returns [] if none exist. */
export async function loadQueue(): Promise<QueueEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.QUEUE);
  const raw = result[STORAGE_KEYS.QUEUE];
  if (!Array.isArray(raw)) return [];
  return raw as QueueEntry[];
}

/** Overwrite the entire queue in storage. */
export async function saveQueue(entries: QueueEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.QUEUE]: entries });
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Create a new entry and append it to the queue. Returns the created entry. */
export async function addToQueue(input: NewQueueEntryInput): Promise<QueueEntry> {
  const entry = createQueueEntry(input);
  const entries = await loadQueue();
  entries.push(entry);
  await saveQueue(entries);
  return entry;
}

/**
 * Apply a partial patch to the entry with the given id.
 * No-ops silently if the id is not found.
 * Returns the updated entries list.
 */
export async function updateQueueEntry(
  id: string,
  patch: Partial<Omit<QueueEntry, 'id' | 'createdAt'>>,
): Promise<QueueEntry[]> {
  const entries = await loadQueue();
  const updated = entries.map((e) =>
    e.id === id ? patchEntry(e, patch) : e,
  );
  await saveQueue(updated);
  return updated;
}

/** Remove entry by id. No-ops if not found. Returns the updated entries list. */
export async function removeFromQueue(id: string): Promise<QueueEntry[]> {
  const entries = await loadQueue();
  const updated = entries.filter((e) => e.id !== id);
  await saveQueue(updated);
  return updated;
}

/** Set entry status — convenience wrapper over updateQueueEntry. */
export async function setEntryStatus(
  id: string,
  status: QueueEntryStatus,
  extra?: Partial<Omit<QueueEntry, 'id' | 'createdAt' | 'status'>>,
): Promise<QueueEntry[]> {
  return updateQueueEntry(id, { status, ...extra });
}
