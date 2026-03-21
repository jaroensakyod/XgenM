// ---------------------------------------------------------------------------
// Timing helpers — wait, poll, retry
// ---------------------------------------------------------------------------

import { ELEMENT_POLL_INTERVAL, ELEMENT_WAIT_TIMEOUT } from './constants';

/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll for a DOM element matching `selector` until found or timeout.
 */
export function waitForElement<T extends Element = Element>(
  selector: string,
  timeout = ELEMENT_WAIT_TIMEOUT,
  interval = ELEMENT_POLL_INTERVAL,
  root: ParentNode = document,
): Promise<T | null> {
  return new Promise((resolve) => {
    const existing = root.querySelector<T>(selector);
    if (existing) return resolve(existing);

    const start = Date.now();
    const timer = setInterval(() => {
      const el = root.querySelector<T>(selector);
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (Date.now() - start >= timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}

/**
 * Try multiple selectors in priority order, returning the first match.
 */
export async function waitForAnySelector<T extends Element = Element>(
  selectors: string[],
  timeout = ELEMENT_WAIT_TIMEOUT,
  root: ParentNode = document,
): Promise<{ element: T; selector: string } | null> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      const el = root.querySelector<T>(sel);
      if (el) return { element: el, selector: sel };
    }
    await sleep(ELEMENT_POLL_INTERVAL);
  }

  return null;
}

/**
 * Retry an async function up to `maxAttempts` times.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) await sleep(delayMs);
    }
  }
  throw lastError;
}
