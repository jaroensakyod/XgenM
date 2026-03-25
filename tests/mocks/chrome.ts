import { vi } from 'vitest';

import type { RuntimeMessage } from '@shared/messages';
import { DEFAULT_SETTINGS, type JobState, type UserSettings } from '@shared/types';

type MockTab = Pick<chrome.tabs.Tab, 'url'>;
type RuntimeListener = (message: RuntimeMessage) => void;

export interface ChromeMock {
  runtime: {
    sendMessage: ReturnType<typeof vi.fn>;
    onMessage: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
  };
  storage: {
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };
  sidePanel: {
    open: ReturnType<typeof vi.fn>;
  };
  __mock: {
    setTabsQueryResult(tabs: MockTab[]): void;
    setJobStateResponse(state: JobState | null): void;
    setJobStateSource(source: 'live' | 'persisted' | 'none'): void;
    setSettingsResponse(settings: UserSettings): void;
    setHistoryResponse(history: JobState[]): void;
    dispatchRuntimeMessage(message: RuntimeMessage): void;
  };
}

export function createChromeMock(): ChromeMock {
  const runtimeListeners = new Set<RuntimeListener>();
  let tabsQueryResult: MockTab[] = [];
  let jobStateResponse: JobState | null = null;
  let jobStateSource: 'live' | 'persisted' | 'none' = 'none';
  let settingsResponse: UserSettings = DEFAULT_SETTINGS;
  let historyResponse: JobState[] = [];

  const chromeMock: ChromeMock = {
    runtime: {
      sendMessage: vi.fn((message?: { action?: string; settings?: Partial<UserSettings> }, callback?: (response: unknown) => void) => {
        if (message?.action === 'GET_JOB_STATE' && callback) {
          callback({ state: jobStateResponse, source: jobStateSource });
        }

        if (message?.action === 'GET_SETTINGS' && callback) {
          callback({ settings: settingsResponse });
        }

        if (message?.action === 'SAVE_SETTINGS' && callback) {
          settingsResponse = {
            ...settingsResponse,
            ...(message.settings ?? {}),
          };
          callback({ settings: settingsResponse });
        }

        if (message?.action === 'GET_JOB_HISTORY' && callback) {
          callback({ history: historyResponse });
        }
      }),
      onMessage: {
        addListener: vi.fn((listener: RuntimeListener) => {
          runtimeListeners.add(listener);
        }),
        removeListener: vi.fn((listener: RuntimeListener) => {
          runtimeListeners.delete(listener);
        }),
      },
    },
    tabs: {
      query: vi.fn((_queryInfo: chrome.tabs.QueryInfo, callback: (tabs: MockTab[]) => void) => {
        callback(tabsQueryResult);
      }),
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
    sidePanel: {
      open: vi.fn(),
    },
    __mock: {
      setTabsQueryResult(tabs) {
        tabsQueryResult = tabs;
      },
      setJobStateResponse(state) {
        jobStateResponse = state;
      },
      setJobStateSource(source) {
        jobStateSource = source;
      },
      setSettingsResponse(settings) {
        settingsResponse = settings;
      },
      setHistoryResponse(history) {
        historyResponse = history;
      },
      dispatchRuntimeMessage(message) {
        for (const listener of runtimeListeners) {
          listener(message);
        }
      },
    },
  };

  return chromeMock;
}
