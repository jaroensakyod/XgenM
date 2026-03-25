import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '@shared/constants';

import {
  appendJobHistory,
  loadJobHistory,
  loadLastJob,
  loadSettings,
  saveLastJob,
  saveSettings,
} from '@background/storage';

describe('background storage helpers', () => {
  beforeEach(() => {
    globalThis.chrome = {
      ...globalThis.chrome,
      storage: {
        ...globalThis.chrome?.storage,
        local: {
          get: vi.fn(),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn(),
        },
      },
    } as unknown as typeof chrome;
  });

  it('loads settings with defaults and validation applied', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.SETTINGS]: {
        defaultMode: 'invalid-mode',
        includeSourceCredit: false,
        maxHashtags: 42,
        captionTemplate: '   ',
      },
    });

    await expect(loadSettings()).resolves.toEqual({
      defaultMode: 'prepare-draft',
      includeSourceCredit: false,
      maxHashtags: 10,
      captionTemplate: '{caption}\n\n{hashtags}\n\nSource: {source}',
    });
  });

  it('saves normalized settings and returns the stored value', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.SETTINGS]: {
        defaultMode: 'prepare-draft',
        includeSourceCredit: true,
        maxHashtags: 5,
        captionTemplate: '{caption}',
      },
    });

    const settings = await saveSettings({
      maxHashtags: -5,
      captionTemplate: '   updated   ',
    });

    expect(settings).toEqual({
      defaultMode: 'prepare-draft',
      includeSourceCredit: true,
      maxHashtags: 0,
      captionTemplate: 'updated',
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.SETTINGS]: settings,
    });
  });

  it('adds timestamps when persisting and loading jobs', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.LAST_JOB]: {
        jobId: 'job-1',
        mode: 'prepare-draft',
        sourceUrl: 'https://www.tiktok.com/@user/video/1',
        platform: 'tiktok',
        phase: 'completed',
        logs: [],
      },
      [STORAGE_KEYS.JOB_HISTORY]: [
        {
          jobId: 'job-2',
          mode: 'auto-post',
          sourceUrl: 'https://www.tiktok.com/@user/video/2',
          platform: 'tiktok',
          phase: 'failed',
          logs: [],
        },
      ],
    });

    await saveLastJob({
      jobId: 'job-3',
      mode: 'prepare-draft',
      sourceUrl: 'https://www.tiktok.com/@user/video/3',
      platform: 'tiktok',
      phase: 'idle',
      logs: [],
    });
    await appendJobHistory({
      jobId: 'job-4',
      mode: 'prepare-draft',
      sourceUrl: 'https://www.tiktok.com/@user/video/4',
      platform: 'tiktok',
      phase: 'completed',
      logs: [],
    });

    const lastJob = await loadLastJob();
    const history = await loadJobHistory();

    expect(lastJob?.createdAt).toBeTruthy();
    expect(lastJob?.updatedAt).toBeTruthy();
    expect(history[0].createdAt).toBeTruthy();
    expect(history[0].updatedAt).toBeTruthy();
  });
});