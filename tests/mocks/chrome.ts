import { vi } from 'vitest';

import type { RuntimeMessage } from '@shared/messages';
import type { JobState } from '@shared/types';

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
    dispatchRuntimeMessage(message: RuntimeMessage): void;
  };
}

export function createChromeMock(): ChromeMock {
  const runtimeListeners = new Set<RuntimeListener>();
  let tabsQueryResult: MockTab[] = [];
  let jobStateResponse: JobState | null = null;

  const chromeMock: ChromeMock = {
    runtime: {
      sendMessage: vi.fn((message?: { action?: string }, callback?: (response: unknown) => void) => {
        if (message?.action === 'GET_JOB_STATE' && callback) {
          callback({ state: jobStateResponse });
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
      dispatchRuntimeMessage(message) {
        for (const listener of runtimeListeners) {
          listener(message);
        }
      },
    },
  };

  return chromeMock;
}
