import { beforeEach, describe, expect, it, vi } from 'vitest';

const startJobMock = vi.fn();
const cancelJobMock = vi.fn();
const getCurrentJobMock = vi.fn();
const appendRuntimeLogMock = vi.fn();
const loadLastJobMock = vi.fn();
const loadSettingsMock = vi.fn();
const saveSettingsMock = vi.fn();
const loadJobHistoryMock = vi.fn();

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
});