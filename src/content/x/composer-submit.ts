// ---------------------------------------------------------------------------
// composer-submit.ts — Post button interaction
// ---------------------------------------------------------------------------

import { waitForAnySelector, sleep } from '@shared/timing';
import { ACTION_DELAY } from '@shared/constants';
import { POST_BUTTON_SELECTORS } from './selectors';

const POST_BUTTON_READY_TIMEOUT_MS = 5_000;

function isPostButtonEnabled(button: HTMLElement): boolean {
  return button.getAttribute('aria-disabled') !== 'true'
    && button.getAttribute('data-disabled') !== 'true'
    && !(button as HTMLButtonElement).disabled;
}

export async function clickPost(): Promise<void> {
  await sleep(ACTION_DELAY);

  const deadline = Date.now() + POST_BUTTON_READY_TIMEOUT_MS;
  let sawPostButton = false;

  while (Date.now() < deadline) {
    const match = await waitForAnySelector<HTMLElement>(
      POST_BUTTON_SELECTORS,
      500,
    );

    if (match) {
      sawPostButton = true;
      if (isPostButtonEnabled(match.element)) {
        match.element.click();
        return;
      }
    }

    await sleep(500);
  }

  if (sawPostButton) {
    throw new Error('Post button is disabled — upload may still be processing.');
  }

  throw new Error('Post button not found.');
}
