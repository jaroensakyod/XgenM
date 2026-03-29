import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SCHEDULER_ALARM_NAME } from '@shared/constants';
import { clearSchedulerAlarm, getSchedulerAlarm, setNextAlarm } from '@background/alarm-manager';
import type { QueueEntry } from '@shared/schedule';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  const now = new Date().toISOString();
  return {
    id: 'test-id',
    kind: 'cross-post',
    sourceUrl: 'https://www.tiktok.com/@user/video/123',
    mode: 'prepare-draft',
    scheduledAt: new Date(Date.now() + 60_000).toISOString(), // 1 min from now
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mockAlarms() {
  const alarmStore: Record<string, chrome.alarms.Alarm> = {};

  globalThis.chrome = {
    ...globalThis.chrome,
    alarms: {
      create: vi.fn().mockImplementation((name: string, info: { when: number }) => {
        alarmStore[name] = {
          name,
          scheduledTime: info.when,
          periodInMinutes: undefined,
        };
      }),
      clear: vi.fn().mockImplementation(async (name: string) => {
        delete alarmStore[name];
        return true;
      }),
      get: vi.fn().mockImplementation(async (name: string) => alarmStore[name]),
    },
  } as unknown as typeof chrome;

  return alarmStore;
}

// ---------------------------------------------------------------------------
// setNextAlarm
// ---------------------------------------------------------------------------

describe('setNextAlarm', () => {
  beforeEach(() => mockAlarms());

  it('creates alarm for the earliest pending entry', async () => {
    const entries = [
      makeEntry({
        id: 'a',
        scheduledAt: new Date(Date.now() + 120_000).toISOString(),
        status: 'pending',
      }),
      makeEntry({
        id: 'b',
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        status: 'pending',
      }),
    ];

    await setNextAlarm(entries);

    expect(chrome.alarms.create).toHaveBeenCalledTimes(1);
    const [name, info] = vi.mocked(chrome.alarms.create).mock.calls[0];
    expect(name).toBe(SCHEDULER_ALARM_NAME);
    // alarm should be set to the earlier entry's time (entry 'b')
    const expectedMs = new Date(entries[1].scheduledAt).getTime();
    expect((info as { when: number }).when).toBeGreaterThanOrEqual(expectedMs - 100);
    expect((info as { when: number }).when).toBeLessThanOrEqual(expectedMs + 5_000);
  });

  it('clears alarm when no pending entries exist', async () => {
    const entries = [
      makeEntry({ id: 'a', status: 'completed' }),
      makeEntry({ id: 'b', status: 'failed' }),
    ];

    await setNextAlarm(entries);

    expect(chrome.alarms.create).not.toHaveBeenCalled();
    expect(chrome.alarms.clear).toHaveBeenCalledWith(SCHEDULER_ALARM_NAME);
  });

  it('clears alarm for empty queue', async () => {
    await setNextAlarm([]);

    expect(chrome.alarms.create).not.toHaveBeenCalled();
    expect(chrome.alarms.clear).toHaveBeenCalledWith(SCHEDULER_ALARM_NAME);
  });

  it('fires immediately when scheduledAt is in the past', async () => {
    const past = new Date(Date.now() - 5_000).toISOString(); // 5s ago
    const entries = [makeEntry({ id: 'a', scheduledAt: past, status: 'pending' })];

    const beforeCall = Date.now();
    await setNextAlarm(entries);
    const afterCall = Date.now();

    const [, info] = vi.mocked(chrome.alarms.create).mock.calls[0];
    const when = (info as { when: number }).when;
    // Should be close to now, not the past timestamp
    expect(when).toBeGreaterThanOrEqual(beforeCall);
    expect(when).toBeLessThanOrEqual(afterCall + 200);
  });

  it('skips running entries when determining the next alarm', async () => {
    const entries = [
      makeEntry({ id: 'a', status: 'running' }), // currently running
      makeEntry({
        id: 'b',
        scheduledAt: new Date(Date.now() + 120_000).toISOString(),
        status: 'pending',
      }),
    ];

    await setNextAlarm(entries);

    expect(chrome.alarms.create).toHaveBeenCalledTimes(1);
    const [, info] = vi.mocked(chrome.alarms.create).mock.calls[0];
    const expectedMs = new Date(entries[1].scheduledAt).getTime();
    expect((info as { when: number }).when).toBeGreaterThanOrEqual(expectedMs - 100);
  });
});

// ---------------------------------------------------------------------------
// clearSchedulerAlarm
// ---------------------------------------------------------------------------

describe('clearSchedulerAlarm', () => {
  beforeEach(() => mockAlarms());

  it('calls chrome.alarms.clear with the scheduler alarm name', async () => {
    await clearSchedulerAlarm();
    expect(chrome.alarms.clear).toHaveBeenCalledWith(SCHEDULER_ALARM_NAME);
  });
});

// ---------------------------------------------------------------------------
// getSchedulerAlarm
// ---------------------------------------------------------------------------

describe('getSchedulerAlarm', () => {
  it('returns the alarm when it exists', async () => {
    const alarmStore = mockAlarms();
    alarmStore[SCHEDULER_ALARM_NAME] = {
      name: SCHEDULER_ALARM_NAME,
      scheduledTime: Date.now() + 60_000,
    };

    const result = await getSchedulerAlarm();
    expect(result?.name).toBe(SCHEDULER_ALARM_NAME);
  });

  it('returns undefined when no alarm is set', async () => {
    mockAlarms();
    const result = await getSchedulerAlarm();
    expect(result).toBeUndefined();
  });
});
