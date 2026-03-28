import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '@shared/constants';

import {
  addToQueue,
  clearFinishedEntries,
  loadQueue,
  removeFromQueue,
  saveQueue,
  setEntryStatus,
  updateQueueEntry,
} from '@background/job-queue';
import type { QueueEntry } from '@shared/schedule';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  const now = new Date('2026-03-28T10:00:00Z').toISOString();
  return {
    id: 'test-id',
    kind: 'cross-post',
    sourceUrl: 'https://www.tiktok.com/@user/video/123',
    mode: 'prepare-draft',
    scheduledAt: '2026-03-28T16:00:00Z',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mockStorage(initial: QueueEntry[] = []) {
  const store: Record<string, unknown> = {
    [STORAGE_KEYS.QUEUE]: initial,
  };

  globalThis.chrome = {
    ...globalThis.chrome,
    storage: {
      ...globalThis.chrome?.storage,
      local: {
        get: vi.fn().mockImplementation(async (key: string) => ({
          [key]: store[key],
        })),
        set: vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
        remove: vi.fn(),
      },
    },
  } as unknown as typeof chrome;

  return store;
}

// ---------------------------------------------------------------------------
// loadQueue
// ---------------------------------------------------------------------------

describe('loadQueue', () => {
  beforeEach(() => mockStorage([]));

  it('returns empty array when no queue exists', async () => {
    mockStorage([]);
    await expect(loadQueue()).resolves.toEqual([]);
  });

  it('returns existing entries', async () => {
    const entry = makeEntry({ id: 'a' });
    mockStorage([entry]);
    const result = await loadQueue();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns empty array when storage value is not an array', async () => {
    globalThis.chrome = {
      ...globalThis.chrome,
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ [STORAGE_KEYS.QUEUE]: null }),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    await expect(loadQueue()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveQueue
// ---------------------------------------------------------------------------

describe('saveQueue', () => {
  it('persists the given entries array', async () => {
    const store = mockStorage([]);
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];

    await saveQueue(entries);

    expect(store[STORAGE_KEYS.QUEUE]).toEqual(entries);
  });
});

// ---------------------------------------------------------------------------
// addToQueue
// ---------------------------------------------------------------------------

describe('addToQueue', () => {
  it('creates a new entry and appends it to an empty queue', async () => {
    mockStorage([]);

    const entry = await addToQueue({
      kind: 'cross-post',
      sourceUrl: 'https://www.tiktok.com/@user/video/123',
      mode: 'prepare-draft',
      scheduledAt: '2026-03-28T16:00:00Z',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.status).toBe('pending');
    expect(entry.sourceUrl).toBe('https://www.tiktok.com/@user/video/123');

    const queue = await loadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(entry.id);
  });

  it('appends to an existing queue without removing prior entries', async () => {
    const existing = makeEntry({ id: 'existing' });
    mockStorage([existing]);

    await addToQueue({
      kind: 'cross-post',
      sourceUrl: 'https://www.tiktok.com/@user/video/456',
      mode: 'auto-post',
      scheduledAt: '2026-03-28T17:00:00Z',
    });

    const queue = await loadQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe('existing');
  });
});

// ---------------------------------------------------------------------------
// updateQueueEntry
// ---------------------------------------------------------------------------

describe('updateQueueEntry', () => {
  it('patches the entry matching the given id', async () => {
    const entry = makeEntry({ id: 'target', status: 'pending' });
    mockStorage([entry]);

    const updated = await updateQueueEntry('target', { status: 'running' });

    const found = updated.find((e) => e.id === 'target');
    expect(found?.status).toBe('running');
  });

  it('updates updatedAt on patch', async () => {
    const entry = makeEntry({ id: 'x', updatedAt: '2026-03-28T10:00:00.000Z' });
    mockStorage([entry]);

    const updated = await updateQueueEntry('x', { status: 'running' });
    const found = updated.find((e) => e.id === 'x');
    expect(found?.updatedAt).not.toBe('2026-03-28T10:00:00.000Z');
  });

  it('no-ops silently for unknown id', async () => {
    const entry = makeEntry({ id: 'real' });
    mockStorage([entry]);

    const updated = await updateQueueEntry('ghost', { status: 'running' });
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// removeFromQueue
// ---------------------------------------------------------------------------

describe('removeFromQueue', () => {
  it('removes the entry with the given id', async () => {
    const a = makeEntry({ id: 'a' });
    const b = makeEntry({ id: 'b' });
    mockStorage([a, b]);

    const updated = await removeFromQueue('a');
    expect(updated.map((e) => e.id)).toEqual(['b']);
  });

  it('no-ops silently for unknown id', async () => {
    const entry = makeEntry({ id: 'real' });
    mockStorage([entry]);

    const updated = await removeFromQueue('ghost');
    expect(updated).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// setEntryStatus
// ---------------------------------------------------------------------------

describe('setEntryStatus', () => {
  it('sets status and optional extra fields', async () => {
    const entry = makeEntry({ id: 'job1', status: 'running' });
    mockStorage([entry]);

    const updated = await setEntryStatus('job1', 'completed', {
      failureReason: undefined,
    });
    const found = updated.find((e) => e.id === 'job1');
    expect(found?.status).toBe('completed');
  });

  it('sets failureReason when provided', async () => {
    const entry = makeEntry({ id: 'job2', status: 'running' });
    mockStorage([entry]);

    const updated = await setEntryStatus('job2', 'failed', {
      failureReason: 'Composer proof failed',
    });
    const found = updated.find((e) => e.id === 'job2');
    expect(found?.status).toBe('failed');
    expect(found?.failureReason).toBe('Composer proof failed');
  });
});

// ---------------------------------------------------------------------------
// clearFinishedEntries
// ---------------------------------------------------------------------------

describe('clearFinishedEntries', () => {
  it('removes completed, failed, and cancelled entries', async () => {
    const pending  = makeEntry({ id: 'p', status: 'pending' });
    const running  = makeEntry({ id: 'r', status: 'running' });
    const done     = makeEntry({ id: 'd', status: 'completed' });
    const failed   = makeEntry({ id: 'f', status: 'failed' });
    const cancelled = makeEntry({ id: 'c', status: 'cancelled' });
    mockStorage([pending, running, done, failed, cancelled]);

    const kept = await clearFinishedEntries();

    expect(kept.map((e) => e.id).sort()).toEqual(['p', 'r'].sort());
  });

  it('returns all entries untouched when none are finished', async () => {
    const pending = makeEntry({ id: 'p', status: 'pending' });
    const running = makeEntry({ id: 'r', status: 'running' });
    mockStorage([pending, running]);

    const kept = await clearFinishedEntries();

    expect(kept).toHaveLength(2);
  });

  it('returns empty array when all entries are finished', async () => {
    const done = makeEntry({ id: 'd', status: 'completed' });
    mockStorage([done]);

    const kept = await clearFinishedEntries();

    expect(kept).toHaveLength(0);
  });
});
