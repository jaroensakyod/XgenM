// ---------------------------------------------------------------------------
// composer-submit.ts — Post button interaction
// ---------------------------------------------------------------------------

import { waitForAnySelector, sleep } from '@shared/timing';
import { ACTION_DELAY } from '@shared/constants';
import { POST_BUTTON_SELECTORS } from './selectors';

export async function clickPost(): Promise<void> {
  await sleep(ACTION_DELAY);

  const match = await waitForAnySelector<HTMLElement>(
    POST_BUTTON_SELECTORS,
  );

  if (!match) {
    throw new Error('Post button not found.');
  }

  const button = match.element;

  if (
    button.getAttribute('aria-disabled') === 'true' ||
    (button as HTMLButtonElement).disabled
  ) {
    await sleep(2000);
    if (
      button.getAttribute('aria-disabled') === 'true' ||
      (button as HTMLButtonElement).disabled
    ) {
      throw new Error('Post button is disabled — upload may still be processing.');
    }
  }

  button.click();
}
