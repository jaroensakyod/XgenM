// ---------------------------------------------------------------------------
// upload.ts — media upload utilities for X
// ---------------------------------------------------------------------------

import { waitForAnySelector, sleep } from '@shared/timing';
import { UPLOAD_WAIT_TIMEOUT, ELEMENT_POLL_INTERVAL } from '@shared/constants';
import {
  MEDIA_INPUT_SELECTORS,
  MEDIA_BUTTON_SELECTORS,
  POST_BUTTON_SELECTORS,
  UPLOAD_PROGRESS_SELECTORS,
  UPLOAD_COMPLETE_SELECTORS,
} from './selectors';

function debugLog(text: string): void {
  chrome.runtime.sendMessage({
    action: 'LOG',
    text: `[x] ${text}`,
    phase: 'uploading-media',
  }).catch(() => {
    // Best-effort diagnostics only.
  });
}

/**
 * Convert a base64 data URL into a File object.
 */
function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'video/mp4';
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new File([ab], fileName, { type: mime });
}

async function getMediaInput(): Promise<HTMLInputElement | null> {
  const initialMatch = await waitForAnySelector<HTMLInputElement>(
    MEDIA_INPUT_SELECTORS,
    3000,
  );

  if (initialMatch) {
    debugLog(`Media input found with selector ${initialMatch.selector}.`);
    return initialMatch.element;
  }

  const buttonMatch = await waitForAnySelector<HTMLElement>(
    MEDIA_BUTTON_SELECTORS,
    3000,
  );

  if (!buttonMatch) {
    debugLog('Media button was not found.');
    return null;
  }

  debugLog(`Clicking media button via selector ${buttonMatch.selector}.`);
  buttonMatch.element.click();
  await sleep(300);

  const postClickMatch = await waitForAnySelector<HTMLInputElement>(
    MEDIA_INPUT_SELECTORS,
    5000,
  );

  if (postClickMatch) {
    debugLog(`Media input found after click with selector ${postClickMatch.selector}.`);
    return postClickMatch.element;
  }

  debugLog('Media input still missing after clicking the media button.');
  return null;
}

function setInputFiles(input: HTMLInputElement, files: FileList): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'files',
  );

  if (descriptor?.set) {
    descriptor.set.call(input, files);
    return;
  }

  Object.defineProperty(input, 'files', {
    value: files,
    writable: true,
    configurable: true,
  });
}

function isPostButtonEnabled(): boolean {
  return POST_BUTTON_SELECTORS.some((selector) => {
    const button = document.querySelector<HTMLElement>(selector);
    if (!button) return false;

    return button.getAttribute('aria-disabled') !== 'true' &&
      !(button as HTMLButtonElement).disabled;
  });
}

export interface UploadCompletionResult {
  completed: boolean;
  detail: string;
}

/**
 * Locate the file input and attach a video file to it.
 */
export async function attachMedia(
  videoDataUrl: string,
  fileName: string,
): Promise<void> {
  const input = await getMediaInput();

  if (!input) {
    throw new Error('Media file input not found on X.');
  }

  debugLog(`Preparing file ${fileName} (${Math.round(videoDataUrl.length / 1024)} KiB data URL).`);
  const file = dataUrlToFile(videoDataUrl, fileName);
  debugLog(`Constructed File object (${Math.round(file.size / 1024)} KiB, ${file.type}).`);

  // Create a DataTransfer to set files on the input
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  setInputFiles(input, dataTransfer.files);
  debugLog('Assigned FileList to X media input.');

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  debugLog('Dispatched input/change events for media upload.');
}

/**
 * Wait until the media upload finishes processing on X.
 * Returns true if upload completed, false if timed out.
 */
export async function waitForUploadComplete(): Promise<UploadCompletionResult> {
  const start = Date.now();
  let sawProgress = false;
  let sawComplete = false;
  let lastState = '';

  // First wait for progress indicator to appear (upload started)
  await sleep(1000);
  debugLog('Waiting for X upload indicators.');

  // Then wait for progress to disappear and a thumbnail to appear
  while (Date.now() - start < UPLOAD_WAIT_TIMEOUT) {
    // Check if progress indicator is gone
    const hasProgress = UPLOAD_PROGRESS_SELECTORS.some(
      (sel) => document.querySelector(sel) !== null,
    );

    // Check if completed indicator is present
    const hasComplete = UPLOAD_COMPLETE_SELECTORS.some(
      (sel) => document.querySelector(sel) !== null,
    );

    const postReady = isPostButtonEnabled();

    if (hasProgress) {
      sawProgress = true;
    }

    const state = `progress=${hasProgress}; complete=${hasComplete}; postReady=${postReady}`;
    if (state !== lastState) {
      debugLog(`Upload state: ${state}`);
      lastState = state;
    }

    if (hasComplete) {
      sawComplete = true;
    }

    if (!hasProgress && hasComplete && postReady) {
      debugLog('Upload complete indicator detected and Post button is enabled.');
      return {
        completed: true,
        detail: `Upload complete via thumbnail indicator and enabled Post button (${state}).`,
      };
    }

    if (!hasProgress && hasComplete && !postReady && sawProgress) {
      debugLog('Attachment is visible, but Post is still disabled. Waiting for processing to finish.');
    }

    await sleep(ELEMENT_POLL_INTERVAL);
  }

  const timeoutDetail = !sawProgress
    ? 'Timed out before any X upload progress indicator appeared.'
    : sawComplete
      ? 'Timed out after attachment became visible, but Post never became enabled.'
      : 'Timed out while upload progress indicators were still unresolved.';
  debugLog(timeoutDetail);
  return {
    completed: false,
    detail: timeoutDetail,
  };
}
