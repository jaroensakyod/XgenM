// ---------------------------------------------------------------------------
// composer-target.ts — Composer element discovery and scoring
// ---------------------------------------------------------------------------

import { sleep } from '@shared/timing';
import { COMPOSER_TEXT_SELECTORS } from './selectors';

function debugLog(text: string): void {
  chrome.runtime.sendMessage({
    action: 'LOG',
    text: `[x] ${text}`,
    phase: 'filling-composer',
  }).catch(() => {});
}

export function isVisibleComposer(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    el.getClientRects().length > 0;
}

export function resolveEditableComposer(el: HTMLElement): HTMLElement | null {
  if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
    return el;
  }

  return el.querySelector<HTMLElement>(
    '[contenteditable="true"][role="textbox"], [contenteditable="true"], [role="textbox"]',
  );
}

export function scoreComposer(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const area = rect.width * rect.height;
  const focused = document.activeElement === el || el.contains(document.activeElement);
  const editableBonus = el.isContentEditable ? 2_000_000 : 0;
  const textboxBonus = el.getAttribute('role') === 'textbox' ? 1_000_000 : 0;
  return area + editableBonus + textboxBonus + (focused ? 3_000_000 : 0);
}

export async function findBestComposer(): Promise<{ element: HTMLElement; selector: string }> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const candidates: Array<{ element: HTMLElement; selector: string }> = [];

    for (const selector of COMPOSER_TEXT_SELECTORS) {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

      for (const element of elements) {
        const editable = resolveEditableComposer(element);
        if (!editable || !isVisibleComposer(editable)) continue;
        candidates.push({ element: editable, selector });
      }
    }

    if (candidates.length > 0) {
      const deduped = candidates.filter((candidate, index, list) =>
        list.findIndex((item) => item.element === candidate.element) === index,
      );

      deduped.sort((a, b) => scoreComposer(b.element) - scoreComposer(a.element));
      const best = deduped[0];
      debugLog(
        `Selected visible composer with selector ${best.selector} from ${deduped.length} candidate(s). ` +
          `editable=${best.element.isContentEditable} role=${best.element.getAttribute('role') ?? ''}`,
      );
      return best;
    }

    await sleep(300);
  }

  throw new Error('Composer text area not found.');
}
