// ---------------------------------------------------------------------------
// tab-manager.ts — helpers for opening / focusing / messaging tabs
// ---------------------------------------------------------------------------

function isMissingReceiverError(error: unknown): boolean {
  return error instanceof Error &&
    error.message.includes('Could not establish connection. Receiving end does not exist.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Open a URL in a new tab and return the tab.
 * If a tab with that URL already exists, focus it instead.
 */
export async function openOrFocusTab(url: string): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ url: `${new URL(url).origin}/*` });
  const existing = tabs.find((t) => t.url?.startsWith(url));
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    return existing;
  }
  return chrome.tabs.create({ url, active: true });
}

/**
 * Wait until a tab finishes loading (status === 'complete').
 * Checks current status first to avoid waiting forever on an already-loaded tab.
 */
export function waitForTabLoad(
  tabId: number,
  timeout = 60_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if tab is already loaded before setting up the listener
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timeout'));
      }, timeout);

      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
      ) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    }).catch(() => reject(new Error('Tab not found')));
  });
}

/**
 * Send a message to a specific tab's content script and await the response.
 */
export async function sendToTab<T>(
  tabId: number,
  message: unknown,
): Promise<T> {
  try {
    return await chrome.tabs.sendMessage(tabId, message) as T;
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await chrome.tabs.reload(tabId);
    await waitForTabLoad(tabId);
    await delay(800);

    return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
  }
}
