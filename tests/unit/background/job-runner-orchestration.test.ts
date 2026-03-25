import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

import type { XActionResultMessage } from '@shared/messages';
import type { UserSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';

// ---------------------------------------------------------------------------
// Phase 3: Upload-Then-Compose Sequence Characterization
//
// Tests the orchestration order in job-runner.ts to validate that:
// 1. UPLOAD_MEDIA is called before COMPOSE_POST
// 2. Auto-post uses single COMPOSE_POST + evidence-based gating
// 3. Prepare-draft mode never calls CLICK_POST
// 4. Evidence-based eligibility controls post/draft/fail outcomes
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

  it('calls COMPOSE_POST once in auto-post mode (evidence-based gating)', async () => {
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
    expect(composeCount).toBe(1);
  });

  it('calls CLICK_POST only after compose succeeds', async () => {
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
    const composeIndex = actions.indexOf('COMPOSE_POST');
    const clickPostIndex = actions.indexOf('CLICK_POST');

    expect(clickPostIndex).toBeGreaterThan(composeIndex);
  });

  it('does NOT call CLICK_POST if compose fails', async () => {
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
          return Promise.resolve({
            action: 'X_ACTION_RESULT', step: 'compose', success: false,
            error: 'Composer fill failed',
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

    expect(composeCalls.length).toBe(1);
    expect(composeCalls[0].message.text).toBeDefined();
    expect(composeCalls[0].message.text!.length).toBeGreaterThan(0);
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
    expect(job?.phase).toBe('awaiting-review');
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

describe('evidence-based compose gating (Phase 3 — single compose)', () => {
  it('documents that compose result is the single source of truth for eligibility', async () => {
    // Phase 3: compose is called once. Evidence from that single call
    // determines whether to post, stop at draft, or fail.
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob('https://www.tiktok.com/@user/video/123', 'auto-post');

    const job = getCurrentJob();
    expect(job?.phase).toBe('completed');

    const composeCalls = getSendToTabCalls().filter(
      (c) => c.message.action === 'COMPOSE_POST',
    );
    // Single compose call — no double-compose
    expect(composeCalls.length).toBe(1);
  });
});

describe('evidence-based gating (Phase 1 contract)', () => {
  it('auto-post proceeds when final evidence is submit-ready', async () => {
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
          return Promise.resolve({ action: 'X_ACTION_RESULT', step: 'upload', success: true });
        }
        if (message.action === 'COMPOSE_POST') {
          return Promise.resolve({
            action: 'X_ACTION_RESULT',
            step: 'compose',
            success: true,
            evidence: {
              proofStatus: 'submit-ready',
              targetSelector: 'div[data-testid="tweetTextarea_0"]',
              insertionStrategy: 'paste',
              visibleText: 'Test caption',
              visibleMatchesExpected: true,
            },
          });
        }
        if (message.action === 'CLICK_POST') {
          return Promise.resolve({ action: 'X_ACTION_RESULT', step: 'post', success: true });
        }
        return Promise.resolve({ action: 'X_ACTION_RESULT', step: 'compose', success: false });
      },
    );

    await startJob('https://www.tiktok.com/@user/video/123', 'auto-post');

    const job = getCurrentJob();
    expect(job?.phase).toBe('completed');
    expect(getActionSequence()).toContain('CLICK_POST');
  });

  it('auto-post stops at draft review when evidence is visible-only', async () => {
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
          return Promise.resolve({ action: 'X_ACTION_RESULT', step: 'upload', success: true });
        }
        if (message.action === 'COMPOSE_POST') {
          return Promise.resolve({
            action: 'X_ACTION_RESULT',
            step: 'compose',
            success: true,
            evidence: {
              proofStatus: 'visible-only',
              targetSelector: 'div[data-testid="tweetTextarea_0"]',
              insertionStrategy: 'paste',
              visibleText: 'Test caption',
              visibleMatchesExpected: false,
            },
          });
        }
        return Promise.resolve({ action: 'X_ACTION_RESULT', step: 'compose', success: false });
      },
    );

    await startJob('https://www.tiktok.com/@user/video/123', 'auto-post');

    const job = getCurrentJob();
    expect(job?.phase).toBe('awaiting-review');
    expect(getActionSequence()).not.toContain('CLICK_POST');
  });

  it('auto-post fails when evidence is proof-failed', async () => {
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
          return Promise.resolve({ action: 'X_ACTION_RESULT', step: 'upload', success: true });
        }
        if (message.action === 'COMPOSE_POST') {
          return Promise.resolve({
            action: 'X_ACTION_RESULT',
            step: 'compose',
            success: true,
            evidence: { proofStatus: 'proof-failed', targetSelector: 'x', insertionStrategy: 'failed', visibleText: '', visibleMatchesExpected: false, errorDetail: 'Composer empty' },
          });
        }
        return Promise.resolve({ action: 'X_ACTION_RESULT', step: 'compose', success: false });
      },
    );

    await startJob('https://www.tiktok.com/@user/video/123', 'auto-post');

    const job = getCurrentJob();
    expect(job?.phase).toBe('failed');
    expect(getActionSequence()).not.toContain('CLICK_POST');
  });

  it('backward-compatible: auto-post still works when no evidence is returned', async () => {
    mockSendToTab({
      UPLOAD_MEDIA: { action: 'X_ACTION_RESULT', step: 'upload', success: true },
      COMPOSE_POST: { action: 'X_ACTION_RESULT', step: 'compose', success: true },
      CLICK_POST: { action: 'X_ACTION_RESULT', step: 'post', success: true },
    });

    await startJob('https://www.tiktok.com/@user/video/123', 'auto-post');

    const job = getCurrentJob();
    expect(job?.phase).toBe('completed');
    expect(getActionSequence()).toContain('CLICK_POST');
  });
});
