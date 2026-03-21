// ---------------------------------------------------------------------------
// page-bridge.ts — inject a script into the page context to access data
// that content scripts cannot reach (e.g. app state, XHR interception).
// ---------------------------------------------------------------------------

import { PAGE_BRIDGE_TIMEOUT, PAGE_FETCH_TIMEOUT } from '@shared/constants';

/**
 * Execute a function in the MAIN world of the page and return its result.
 * This is needed because content scripts run in an isolated world and cannot
 * access page-level JS variables such as React state or window.__INIT_DATA__.
 */
export function runInPageContext<T>(fn: () => T): Promise<T> {
  return runInPageContextWithTimeout(fn, PAGE_BRIDGE_TIMEOUT);
}

export function runInPageContextWithTimeout<T, TArgs extends unknown[]>(
  fn: (...args: TArgs) => T,
  timeoutMs: number,
  ...args: TArgs
): Promise<T> {
  return new Promise((resolve, reject) => {
    const eventId = `__xgenm_bridge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let settled = false;
    const serializedArgs = JSON.stringify(args);

    const cleanup = (handler: (e: Event) => void, timer: number) => {
      window.removeEventListener(eventId, handler);
      window.clearTimeout(timer);
    };

    const handler = (e: Event) => {
      if (settled) return;
      settled = true;
      const detail = (e as CustomEvent).detail;
      cleanup(handler, timer);
      if (detail.error) {
        reject(new Error(detail.error));
      } else {
        resolve(detail.result as T);
      }
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup(handler, timer);
      reject(new Error('Page bridge timed out.'));
    }, timeoutMs);

    window.addEventListener(eventId, handler);

    const script = document.createElement('script');
    script.textContent = `
      (async function() {
        try {
          const args = ${serializedArgs};
          const result = await (${fn.toString()})(...args);
          window.dispatchEvent(new CustomEvent('${eventId}', { detail: { result } }));
        } catch (e) {
          window.dispatchEvent(new CustomEvent('${eventId}', { detail: { error: e instanceof Error ? e.message : String(e) } }));
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
  });
}

/**
 * Fetch a resource from the page context and return a page-owned blob URL.
 * This keeps the bridge payload small and avoids pushing large base64 strings
 * through CustomEvent detail.
 */
export async function fetchBlobUrlInPageContext(url: string): Promise<string> {
  const result = await runInPageContextWithTimeout((targetUrl: string) => {
    return fetch(targetUrl, {
      credentials: 'include',
      mode: 'cors',
      referrer: window.location.href,
      referrerPolicy: 'strict-origin-when-cross-origin',
      cache: 'no-store',
    })
      .then((r: Response) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.blob();
      })
      .then((blob: Blob) => URL.createObjectURL(blob));
  }, PAGE_FETCH_TIMEOUT, url);
  return result as unknown as string;
}

export async function revokeObjectUrlInPageContext(blobUrl: string): Promise<void> {
  await runInPageContextWithTimeout((targetBlobUrl: string) => {
    URL.revokeObjectURL(targetBlobUrl);
  }, PAGE_BRIDGE_TIMEOUT, blobUrl);
}
