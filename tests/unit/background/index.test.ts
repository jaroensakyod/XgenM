import { beforeEach, describe, expect, it, vi } from 'vitest';

const startJobMock = vi.fn();
const cancelJobMock = vi.fn();
const getCurrentJobMock = vi.fn();
const appendRuntimeLogMock = vi.fn();
const loadLastJobMock = vi.fn();
const loadSettingsMock = vi.fn();
const saveSettingsMock = vi.fn();
const loadJobHistoryMock = vi.fn();
const loadQueueMock = vi.fn().mockResolvedValue([]);
const addToQueueMock = vi.fn();
const removeFromQueueMock = vi.fn();
const setEntryStatusMock = vi.fn().mockResolvedValue([]);
const clearFinishedEntriesMock = vi.fn().mockResolvedValue([]);
const setNextAlarmMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@background/job-runner', () => ({
  startJob: startJobMock,
  cancelJob: cancelJobMock,
  getCurrentJob: getCurrentJobMock,
  appendRuntimeLog: appendRuntimeLogMock,
}));

vi.mock('@background/storage', () => ({
  loadLastJob: loadLastJobMock,
  loadSettings: loadSettingsMock,
  saveSettings: saveSettingsMock,
  loadJobHistory: loadJobHistoryMock,
}));

vi.mock('@background/job-queue', () => ({
  loadQueue: loadQueueMock,
  addToQueue: addToQueueMock,
  removeFromQueue: removeFromQueueMock,
  setEntryStatus: setEntryStatusMock,
  updateQueueEntry: vi.fn().mockResolvedValue(undefined),
  clearFinishedEntries: clearFinishedEntriesMock,
}));

vi.mock('@background/alarm-manager', () => ({
  setNextAlarm: setNextAlarmMock,
  clearSchedulerAlarm: vi.fn().mockResolvedValue(undefined),
  getSchedulerAlarm: vi.fn().mockResolvedValue(null),
}));

vi.mock('@shared/schedule', () => ({
  getNextReadyEntry: vi.fn().mockReturnValue(null),
  getNextPendingEntry: vi.fn().mockReturnValue(null),
  sortByScheduledAt: vi.fn((arr: unknown[]) => arr),
}));

type RuntimeListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

describe('background message router', () => {
  let listener: RuntimeListener;

  beforeEach(async () => {
    vi.resetModules();
    startJobMock.mockReset();
    cancelJobMock.mockReset();
    getCurrentJobMock.mockReset();
    appendRuntimeLogMock.mockReset();
    loadLastJobMock.mockReset();
    loadSettingsMock.mockReset();
    saveSettingsMock.mockReset();
    loadJobHistoryMock.mockReset();
    loadQueueMock.mockReset().mockResolvedValue([]);
    addToQueueMock.mockReset();
    removeFromQueueMock.mockReset();
    setEntryStatusMock.mockReset().mockResolvedValue([]);
    clearFinishedEntriesMock.mockReset().mockResolvedValue([]);
    setNextAlarmMock.mockReset().mockResolvedValue(undefined);

    globalThis.chrome = {
      ...globalThis.chrome,
      runtime: {
        ...globalThis.chrome?.runtime,
        onMessage: {
          addListener: vi.fn((registered: RuntimeListener) => {
            listener = registered;
          }),
        },
        onInstalled: {
          addListener: vi.fn(),
        },
      },
      sidePanel: {
        setPanelBehavior: vi.fn(),
      },
      alarms: {
        onAlarm: {
          addListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    await import('@background/index');
  });

  it('falls back to persisted job state when no live job exists', async () => {
    getCurrentJobMock.mockReturnValue(null);
    loadLastJobMock.mockResolvedValue({
      jobId: 'job-1',
      mode: 'prepare-draft',
      sourceUrl: 'https://www.tiktok.com/@user/video/1',
      platform: 'tiktok',
      phase: 'completed',
      logs: [],
    });

    const sendResponse = vi.fn();
    listener({ action: 'GET_JOB_STATE' }, {} as chrome.runtime.MessageSender, sendResponse);
    await Promise.resolve();

    expect(loadLastJobMock).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      state: expect.objectContaining({ jobId: 'job-1' }),
      source: 'persisted',
    });
  });

  it('loads and saves settings through the message router', async () => {
    loadSettingsMock.mockResolvedValue({
      defaultMode: 'auto-post',
      includeSourceCredit: true,
      maxHashtags: 4,
      captionTemplate: '{caption}',
    });
    saveSettingsMock.mockResolvedValue({
      defaultMode: 'prepare-draft',
      includeSourceCredit: false,
      maxHashtags: 2,
      captionTemplate: '{caption}\n{hashtags}',
    });

    const getResponse = vi.fn();
    const saveResponse = vi.fn();

    listener({ action: 'GET_SETTINGS' }, {} as chrome.runtime.MessageSender, getResponse);
    listener({
      action: 'SAVE_SETTINGS',
      settings: { maxHashtags: 2 },
    }, {} as chrome.runtime.MessageSender, saveResponse);
    await Promise.resolve();

    expect(getResponse).toHaveBeenCalledWith({
      settings: {
        defaultMode: 'auto-post',
        includeSourceCredit: true,
        maxHashtags: 4,
        captionTemplate: '{caption}',
      },
    });
    expect(saveSettingsMock).toHaveBeenCalledWith({ maxHashtags: 2 });
    expect(saveResponse).toHaveBeenCalledWith({
      settings: {
        defaultMode: 'prepare-draft',
        includeSourceCredit: false,
        maxHashtags: 2,
        captionTemplate: '{caption}\n{hashtags}',
      },
    });
  });

  it('GET_QUEUE returns current queue entries', async () => {
    const fakeEntry = {
      id: 'e1',
      sourceUrl: 'https://www.tiktok.com/@u/video/1',
      mode: 'prepare-draft',
      status: 'pending',
      scheduledAt: Date.now() + 60_000,
      createdAt: Date.now(),
    };
    loadQueueMock.mockResolvedValue([fakeEntry]);

    const sendResponse = vi.fn();
    listener({ action: 'GET_QUEUE' }, {} as chrome.runtime.MessageSender, sendResponse);
    await new Promise((r) => setTimeout(r, 10));

    expect(loadQueueMock).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ entries: [fakeEntry] });
  });

  it('ADD_TO_QUEUE creates entry, re-arms alarm, and responds', async () => {
    const fakeEntry = {
      id: 'e2',
      sourceUrl: 'https://www.tiktok.com/@u/video/2',
      mode: 'prepare-draft',
      status: 'pending',
      scheduledAt: Date.now() + 60_000,
      createdAt: Date.now(),
    };
    addToQueueMock.mockResolvedValue(fakeEntry);
    loadQueueMock.mockResolvedValue([fakeEntry]);

    const sendResponse = vi.fn();
    listener(
      { action: 'ADD_TO_QUEUE', entry: { sourceUrl: fakeEntry.sourceUrl, mode: 'prepare-draft', scheduledAt: fakeEntry.scheduledAt } },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(addToQueueMock).toHaveBeenCalled();
    expect(setNextAlarmMock).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ entry: fakeEntry });
  });

  it('REMOVE_FROM_QUEUE removes entry, re-arms alarm, and responds', async () => {
    removeFromQueueMock.mockResolvedValue([]);
    loadQueueMock.mockResolvedValue([]);

    const sendResponse = vi.fn();
    listener(
      { action: 'REMOVE_FROM_QUEUE', id: 'e1' },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(removeFromQueueMock).toHaveBeenCalledWith('e1');
    expect(setNextAlarmMock).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ack: true });
  });

  it('CANCEL_QUEUE_ENTRY for pending entry — marks cancelled, re-arms, broadcasts', async () => {
    const pendingEntry = {
      id: 'cancel-me',
      status: 'pending',
      sourceUrl: 'https://www.tiktok.com/@u/video/9',
      mode: 'prepare-draft',
      scheduledAt: Date.now() + 60_000,
      createdAt: Date.now(),
    };
    loadQueueMock.mockResolvedValue([pendingEntry]);

    const sendResponse = vi.fn();
    listener(
      { action: 'CANCEL_QUEUE_ENTRY', id: 'cancel-me' },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(setEntryStatusMock).toHaveBeenCalledWith('cancel-me', 'cancelled');
    expect(setNextAlarmMock).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ack: true });
  });

  it('CANCEL_QUEUE_ENTRY for running entry — calls cancelJob, marks cancelled, re-arms', async () => {
    const runningEntry = {
      id: 'running-me',
      status: 'running',
      sourceUrl: 'https://www.tiktok.com/@u/video/10',
      mode: 'auto-post',
      scheduledAt: Date.now() + 60_000,
      createdAt: Date.now(),
    };
    loadQueueMock.mockResolvedValue([runningEntry]);

    const sendResponse = vi.fn();
    listener(
      { action: 'CANCEL_QUEUE_ENTRY', id: 'running-me' },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(cancelJobMock).toHaveBeenCalled();
    expect(setEntryStatusMock).toHaveBeenCalledWith('running-me', 'cancelled');
    expect(setNextAlarmMock).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ack: true });
  });

  it('CANCEL_QUEUE_ENTRY for unknown id — no-ops and responds ack', async () => {
    loadQueueMock.mockResolvedValue([]);

    const sendResponse = vi.fn();
    listener(
      { action: 'CANCEL_QUEUE_ENTRY', id: 'ghost' },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(setEntryStatusMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ack: true });
  });

  it('CLEAR_FINISHED_QUEUE — calls clearFinishedEntries and responds ack', async () => {
    clearFinishedEntriesMock.mockResolvedValue([]);

    const sendResponse = vi.fn();
    listener(
      { action: 'CLEAR_FINISHED_QUEUE' },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(clearFinishedEntriesMock).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ack: true });
  });
});