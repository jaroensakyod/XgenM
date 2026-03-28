import { describe, expect, it } from 'vitest';

import {
  createQueueEntry,
  getNextPendingEntry,
  getNextReadyEntry,
  isEntryReady,
  patchEntry,
  sortByScheduledAt,
  type QueueEntry,
} from '@shared/schedule';

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
    scheduledAt: now,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createQueueEntry
// ---------------------------------------------------------------------------

describe('createQueueEntry', () => {
  it('generates a valid entry with id and timestamps', () => {
    const entry = createQueueEntry({
      kind: 'cross-post',
      sourceUrl: 'https://www.tiktok.com/@user/video/123',
      mode: 'prepare-draft',
      scheduledAt: '2026-03-28T16:00:00Z',
    });

    expect(entry.id).toBeTypeOf('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.status).toBe('pending');
    expect(entry.sourceUrl).toBe('https://www.tiktok.com/@user/video/123');
    expect(entry.scheduledAt).toBe('2026-03-28T16:00:00Z');
    expect(entry.createdAt).toBeTruthy();
    expect(entry.updatedAt).toBeTruthy();
  });

  it('includes optional captionOverride when provided', () => {
    const entry = createQueueEntry({
      kind: 'cross-post',
      sourceUrl: 'https://www.tiktok.com/@user/video/123',
      mode: 'auto-post',
      scheduledAt: '2026-03-28T16:00:00Z',
      captionOverride: 'Custom caption',
    });

    expect(entry.captionOverride).toBe('Custom caption');
    expect(entry.mode).toBe('auto-post');
  });

  it('omits captionOverride when not provided', () => {
    const entry = createQueueEntry({
      kind: 'cross-post',
      sourceUrl: 'https://www.tiktok.com/@user/video/123',
      mode: 'prepare-draft',
      scheduledAt: '2026-03-28T16:00:00Z',
    });

    expect(entry.captionOverride).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isEntryReady
// ---------------------------------------------------------------------------

describe('isEntryReady', () => {
  const scheduledAt = '2026-03-28T16:00:00Z';
  const scheduledMs = new Date(scheduledAt).getTime();

  it('returns true when entry is pending and scheduledAt has passed', () => {
    const entry = makeEntry({ scheduledAt, status: 'pending' });
    expect(isEntryReady(entry, scheduledMs + 1000)).toBe(true);
  });

  it('returns true when scheduledAt is exactly now', () => {
    const entry = makeEntry({ scheduledAt, status: 'pending' });
    expect(isEntryReady(entry, scheduledMs)).toBe(true);
  });

  it('returns false when scheduledAt is in the future', () => {
    const entry = makeEntry({ scheduledAt, status: 'pending' });
    expect(isEntryReady(entry, scheduledMs - 1000)).toBe(false);
  });

  it('returns false when status is running', () => {
    const entry = makeEntry({ scheduledAt, status: 'running' });
    expect(isEntryReady(entry, scheduledMs + 1000)).toBe(false);
  });

  it('returns false when status is completed', () => {
    const entry = makeEntry({ scheduledAt, status: 'completed' });
    expect(isEntryReady(entry, scheduledMs + 1000)).toBe(false);
  });

  it('returns false when status is cancelled', () => {
    const entry = makeEntry({ scheduledAt, status: 'cancelled' });
    expect(isEntryReady(entry, scheduledMs + 1000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sortByScheduledAt
// ---------------------------------------------------------------------------

describe('sortByScheduledAt', () => {
  it('sorts entries by scheduledAt ascending', () => {
    const a = makeEntry({ id: 'a', scheduledAt: '2026-03-28T18:00:00Z' });
    const b = makeEntry({ id: 'b', scheduledAt: '2026-03-28T16:00:00Z' });
    const c = makeEntry({ id: 'c', scheduledAt: '2026-03-28T17:00:00Z' });

    const sorted = sortByScheduledAt([a, b, c]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the original array', () => {
    const entries = [
      makeEntry({ id: 'a', scheduledAt: '2026-03-28T18:00:00Z' }),
      makeEntry({ id: 'b', scheduledAt: '2026-03-28T16:00:00Z' }),
    ];
    const original = [...entries];
    sortByScheduledAt(entries);
    expect(entries.map((e) => e.id)).toEqual(original.map((e) => e.id));
  });
});

// ---------------------------------------------------------------------------
// getNextReadyEntry
// ---------------------------------------------------------------------------

describe('getNextReadyEntry', () => {
  it('returns the earliest pending entry that is ready', () => {
    const nowMs = new Date('2026-03-28T17:30:00Z').getTime();
    const entries = [
      makeEntry({ id: 'a', scheduledAt: '2026-03-28T18:00:00Z', status: 'pending' }),
      makeEntry({ id: 'b', scheduledAt: '2026-03-28T16:00:00Z', status: 'pending' }),
      makeEntry({ id: 'c', scheduledAt: '2026-03-28T17:00:00Z', status: 'pending' }),
    ];
    const result = getNextReadyEntry(entries, nowMs);
    expect(result?.id).toBe('b');
  });

  it('skips completed entries even if past scheduledAt', () => {
    const nowMs = new Date('2026-03-28T20:00:00Z').getTime();
    const entries = [
      makeEntry({ id: 'a', scheduledAt: '2026-03-28T16:00:00Z', status: 'completed' }),
      makeEntry({ id: 'b', scheduledAt: '2026-03-28T17:00:00Z', status: 'pending' }),
    ];
    const result = getNextReadyEntry(entries, nowMs);
    expect(result?.id).toBe('b');
  });

  it('returns undefined when nothing is ready', () => {
    const nowMs = new Date('2026-03-28T14:00:00Z').getTime();
    const entries = [
      makeEntry({ id: 'a', scheduledAt: '2026-03-28T16:00:00Z', status: 'pending' }),
    ];
    expect(getNextReadyEntry(entries, nowMs)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(getNextReadyEntry([], Date.now())).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getNextPendingEntry
// ---------------------------------------------------------------------------

describe('getNextPendingEntry', () => {
  it('returns the earliest pending entry regardless of readiness', () => {
    const entries = [
      makeEntry({ id: 'a', scheduledAt: '2026-03-29T16:00:00Z', status: 'pending' }),
      makeEntry({ id: 'b', scheduledAt: '2026-03-28T16:00:00Z', status: 'pending' }),
      makeEntry({ id: 'c', scheduledAt: '2026-03-28T17:00:00Z', status: 'completed' }),
    ];
    const result = getNextPendingEntry(entries);
    expect(result?.id).toBe('b');
  });

  it('returns undefined when no pending entries exist', () => {
    const entries = [
      makeEntry({ id: 'a', status: 'completed' }),
      makeEntry({ id: 'b', status: 'failed' }),
    ];
    expect(getNextPendingEntry(entries)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// patchEntry
// ---------------------------------------------------------------------------

describe('patchEntry', () => {
  it('applies patch and updates updatedAt', () => {
    const entry = makeEntry({ id: 'x', status: 'pending' });
    const patched = patchEntry(entry, { status: 'running' });

    expect(patched.id).toBe('x');
    expect(patched.status).toBe('running');
    expect(patched.createdAt).toBe(entry.createdAt);
    expect(patched.updatedAt).not.toBe(entry.updatedAt);
  });

  it('preserves id and createdAt even if patch tries to override', () => {
    const entry = makeEntry({ id: 'x', createdAt: '2026-01-01T00:00:00Z' });
    // @ts-expect-error intentionally testing guard
    const patched = patchEntry(entry, { id: 'hacked', createdAt: 'hacked' });

    expect(patched.id).toBe('x');
    expect(patched.createdAt).toBe('2026-01-01T00:00:00Z');
  });
});
