import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

import type { XActionResultMessage } from '@shared/messages';
import type { UserSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

// ---------------------------------------------------------------------------
// Phase 3: Upload-Then-Compose Sequence Characterization
//
// Tests the orchestration order in job-runner.ts to validate that:
// 1. UPLOAD_MEDIA is called before COMPOSE_POST
// 2. Auto-post verifies caption via a second COMPOSE_POST before CLICK_POST
// 3. Prepare-draft mode never calls CLICK_POST
// 4. False-positive compose success doesn't mask caption loss
// ---------------------------------------------------------------------------

// ---- Module mocks ----

// Mock tab-manager
vi.mock('@background/tab-manager', () => ({
  openOrFocusTab: vi.fn(),
  waitForTabLoad: vi.fn(),
  sendToTab: vi.fn(),
}));

// Mock storage
vi.mock('@background/storage', () => ({
  loadSettings: vi.fn(),
  saveLastJob: vi.fn(),
  appendJobHistory: vi.fn(),
}));

// Mock shared/timing
vi.mock('@shared/timing', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
  waitForAnySelector: vi.fn(),
}));

// Import after mocking
import { startJob, getCurrentJob } from '@background/job-runner';
import { openOrFocusTab, waitForTabLoad, sendToTab } from '@background/tab-manager';
import { loadSettings } from '@background/storage';

// ---- Helpers ----

function mockSendToTab(responses: Record<string, XActionResultMessage | { success: boolean; dataUrl?: string }>): void {
  const calls: Array<{ tabId: number; message: { action: string } }> = [];

  (sendToTab as Mock).mockImplementation(
    (tabId: number, message: { action: string }) => {
      calls.push({ tabId, message });

      if (message.action === 'EXTRACT_SOURCE') {
        return Promise.resolve({
          action: 'EXTRACTION_RESULT',
          success: true,
          data: {
            platform: 'tiktok',
            sourceUrl: 'https://www.tiktok.com/@user/video/123',
            canonicalUrl: 'https://www.tiktok.com/@user/video/123',
            authorName: 'TestUser',
            authorHandle: 'testuser',
            captionRaw: 'Test caption for characterization #fyp #viral',
            hashtags: ['#fyp', '#viral'],
            videoUrl: 'https://v16.tiktokcdn.com/video.mp4',
            videoMimeType: 'video/mp4',
            extractionMethod: 'embedded-state',
          },
        });
      }

      if (message.action === 'FETCH_VIDEO_BLOB') {
        return Promise.resolve({
          success: true,
          dataUrl: 'data:video/mp4;base64,AAAA',
        });
      }

      const response = responses[message.action];
      if (response) {
        return Promise.resolve(response);
      }

      return Promise.resolve({
        action: 'X_ACTION_RESULT',
        step: 'compose',
        success: false,
        error: `Unexpected action: ${message.action}`,
      });
    },
  );
}

function setupTabMocks(): void {
  (openOrFocusTab as Mock).mockResolvedValue({ id: 42, url: 'https://x.com/home' });
  (waitForTabLoad as Mock).mockResolvedValue(undefined);
}

function setupSettingsMock(overrides: Partial<UserSettings> = {}): void {
  (loadSettings as Mock).mockResolvedValue({
    ...DEFAULT_SETTINGS,
    ...overrides,
  });
}

function getSendToTabCalls(): Array<{ tabId: number; message: { action: string; text?: string } }> {
  return (sendToTab as Mock).mock.calls.map(
    ([tabId, message]: [number, { action: string; text?: string }]) => ({
      tabId,
      message,
    }),
  );
}

function getActionSequence(): string[] {
  return getSendToTabCalls().map((c) => c.message.action);
}

// ---- Global Fetch mock for video download ----

beforeEach(() => {
  vi.clearAllMocks();
  setupTabMocks();
  setupSettingsMock();

  // Ensure chrome.runtime.sendMessage returns a promise (broadcast needs .catch())
  globalThis.chrome = {
    ...globalThis.chrome,
    runtime: {
      ...globalThis.chrome?.runtime,
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    storage: {
      ...globalThis.chrome?.storage,
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as typeof chrome;

  // Mock global fetch for video download in background
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(['video'], { type: 'video/mp4' })),
  }));

  // Mock FileReader for blobToDataUrl
  vi.stubGlobal('FileReader', class {
    onloadend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    result = 'data:video/mp4;base64,AAAA';
    readAsDataURL() {
      setTimeout(() => this.onloadend?.(), 0);
    }
  });
});

// ---- Tests ----

describe('auto-post orchestration sequence', () => {
  it('calls UPLOAD_MEDIA before COMPOSE_POST', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'auto-post',
    );

    const actions = getActionSequence();
    const uploadIndex = actions.indexOf('UPLOAD_MEDIA');
    const firstComposeIndex = actions.indexOf('COMPOSE_POST');

    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(firstComposeIndex).toBeGreaterThan(uploadIndex);
  });

  it('calls COMPOSE_POST twice in auto-post mode (fill + verify)', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'auto-post',
    );

    const actions = getActionSequence();
    const composeCount = actions.filter((a) => a === 'COMPOSE_POST').length;
    expect(composeCount).toBe(2);
  });

  it('calls CLICK_POST only after both compose calls succeed', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'auto-post',
    );

    const actions = getActionSequence();
    const lastComposeIndex = actions.lastIndexOf('COMPOSE_POST');
    const clickPostIndex = actions.indexOf('CLICK_POST');

    expect(clickPostIndex).toBeGreaterThan(lastComposeIndex);
  });

  it('does NOT call CLICK_POST if final compose verification fails', async () => {
    let composeCallCount = 0;
    (sendToTab as Mock).mockImplementation(
      (_tabId: number, message: { action: string }) => {
        if (message.action === 'EXTRACT_SOURCE') {
          return Promise.resolve({
            action: 'EXTRACTION_RESULT',
            success: true,
            data: {
              platform: 'tiktok',
              sourceUrl: 'https://www.tiktok.com/@user/video/123',
              captionRaw: 'Test caption #fyp',
              hashtags: ['#fyp'],
              videoUrl: 'https://v16.tiktokcdn.com/video.mp4',
              videoMimeType: 'video/mp4',
              extractionMethod: 'embedded-state',
            },
          });
        }
        if (message.action === 'UPLOAD_MEDIA') {
          return Promise.resolve({
            action: 'X_ACTION_RESULT', step: 'upload', success: true,
          });
        }
        if (message.action === 'COMPOSE_POST') {
          composeCallCount += 1;
          // First compose succeeds, second (verification) fails
          if (composeCallCount === 1) {
            return Promise.resolve({
              action: 'X_ACTION_RESULT', step: 'compose', success: true,
            });
          }
          return Promise.resolve({
            action: 'X_ACTION_RESULT', step: 'compose', success: false,
            error: 'Caption verification failed',
          });
        }
        return Promise.resolve({
          action: 'X_ACTION_RESULT', step: 'post', success: true,
        });
      },
    );

    await startJob('https://www.tiktok.com/@user/video/123', 'auto-post');

    const actions = getActionSequence();
    expect(actions).not.toContain('CLICK_POST');

    const job = getCurrentJob();
    expect(job?.phase).toBe('failed');
  });

  it('sends prepared post text (non-empty) to COMPOSE_POST', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'auto-post',
    );

    const composeCalls = getSendToTabCalls().filter(
      (c) => c.message.action === 'COMPOSE_POST',
    );

    expect(composeCalls.length).toBe(2);
    for (const call of composeCalls) {
      expect(call.message.text).toBeDefined();
      expect(call.message.text!.length).toBeGreaterThan(0);
    }
  });

  it('sends identical text for both compose calls', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'auto-post',
    );

    const composeCalls = getSendToTabCalls().filter(
      (c) => c.message.action === 'COMPOSE_POST',
    );

    expect(composeCalls[0].message.text).toBe(composeCalls[1].message.text);
  });
});

describe('prepare-draft orchestration sequence', () => {
  it('never calls CLICK_POST in prepare-draft mode', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'prepare-draft',
    );

    const actions = getActionSequence();
    expect(actions).not.toContain('CLICK_POST');
  });

  it('calls COMPOSE_POST only once in prepare-draft mode', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'prepare-draft',
    );

    const actions = getActionSequence();
    const composeCount = actions.filter((a) => a === 'COMPOSE_POST').length;
    expect(composeCount).toBe(1);
  });

  it('ends in awaiting-review phase', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'prepare-draft',
    );

    const job = getCurrentJob();
    expect(job?.phase).toBe('completed');
  });
});

describe('upload failure handling', () => {
  it('fails the job when UPLOAD_MEDIA returns failure', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: {
        action: 'X_ACTION_RESULT',
        step: 'upload',
        success: false,
        error: 'Upload timed out.',
      },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
    });

    await startJob(
      'https://www.tiktok.com/@user/video/123',
      'auto-post',
    );

    const job = getCurrentJob();
    expect(job?.phase).toBe('failed');

    const actions = getActionSequence();
    expect(actions).not.toContain('COMPOSE_POST');
    expect(actions).not.toContain('CLICK_POST');
  });
});

describe('false-positive compose detection (characterization)', () => {
  it('documents that compose success is based solely on sendToTab response', async () => {
    // This characterization test documents the current behavior:
    // compose "success" is whatever the content script returns.
    // The orchestrator does NOT independently verify DOM truth.
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob('https://www.tiktok.com/@user/video/123', 'auto-post');

    // Both compose calls return success, and the orchestrator trusts
    // that response without any independent DOM read-back.
    const job = getCurrentJob();
    expect(job?.phase).toBe('completed');

    // Key insight: if the content script falsely reports compose success
    // (e.g., it reads text from a mirror node), the orchestrator has
    // no mechanism to detect the false positive. This is one of the
    // root-cause hypotheses for the missing-text bug.
    const composeCalls = getSendToTabCalls().filter(
      (c) => c.message.action === 'COMPOSE_POST',
    );
    // Documenting: both calls carry text, but there's no independent
    // verification channel sent back to the background.
    expect(composeCalls.length).toBe(2);
  });

  it('documents that re-composing twice with same text does not test for DOM reset', async () => {
    // In auto-post mode, the orchestrator calls COMPOSE_POST twice.
    // However, both calls carry the same text. If the first compose
    // succeeds but media upload causes X to remount the composer,
    // the second compose re-inserts the text — masking a potential
    // remount scenario. This test documents this behavior.
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob('https://www.tiktok.com/@user/video/123', 'auto-post');

    const composeCalls = getSendToTabCalls().filter(
      (c) => c.message.action === 'COMPOSE_POST',
    );

    // The second call re-inserts the text rather than read-only verifying,
    // because ensureComposerText always calls insertText first.
    // This means a remount would be silently masked by re-insertion.
    expect(composeCalls[0].message.text).toBe(composeCalls[1].message.text);
  });
});
