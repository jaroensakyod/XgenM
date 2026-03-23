// ---------------------------------------------------------------------------
// composer-write.ts — Text insertion into X's contenteditable composer
// ---------------------------------------------------------------------------

import type { InsertionStrategyLabel } from '@shared/types';
import { sleep } from '@shared/timing';

export interface InsertionResult {
  applied: boolean;
  strategy: InsertionStrategyLabel;
}

export function normalizeComposerText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesExpectedComposerText(actual: string, expected: string): boolean {
  const normalizedExpected = normalizeComposerText(expected);
  if (!normalizedExpected) return actual.length > 0;

  return actual === normalizedExpected || actual.includes(normalizedExpected);
}

export interface ComposerInsertionRuntime {
  execCommand?: (
    commandId: string,
    showUI?: boolean,
    value?: string,
  ) => boolean;
  sleep?: (ms: number) => Promise<void>;
  getSelection?: () => Selection | null;
}

function defineEventProperties<T extends Event>(
  event: T,
  properties: Record<string, unknown>,
): T {
  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(event, key, {
      value,
      configurable: true,
      enumerable: true,
    });
  }

  return event;
}

function createDataTransfer(text: string): DataTransfer {
  if (typeof DataTransfer === 'function') {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    return dataTransfer;
  }

  const store = new Map<string, string>();
  const fallback = {
    dropEffect: 'none',
    effectAllowed: 'all',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as string[],
    getData(format: string) {
      return store.get(format) ?? '';
    },
    setData(format: string, value: string) {
      store.set(format, value);
      this.types = Array.from(store.keys());
    },
    clearData(format?: string) {
      if (format) {
        store.delete(format);
      } else {
        store.clear();
      }
      this.types = Array.from(store.keys());
    },
    setDragImage() {},
  };

  fallback.setData('text/plain', text);
  return fallback as unknown as DataTransfer;
}

function createPasteEvent(dataTransfer: DataTransfer): Event {
  const init = {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  };

  if (typeof ClipboardEvent === 'function') {
    try {
      const event = new ClipboardEvent('paste', init);
      return defineEventProperties(event, { clipboardData: dataTransfer });
    } catch {
      // Fall back to a generic Event in environments with partial ClipboardEvent support.
    }
  }

  const event = new Event('paste', {
    bubbles: true,
    cancelable: true,
  });
  return defineEventProperties(event, { clipboardData: dataTransfer });
}

function placeCursorAtEnd(
  el: HTMLElement,
  getSelection: () => Selection | null,
): void {
  const selection = getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function composeTextLooksApplied(el: HTMLElement, text: string): boolean {
  const currentText = (el.innerText || el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  const expectedSample = text.replace(/\s+/g, ' ').trim().slice(0, 24);
  return Boolean(currentText && expectedSample && currentText.includes(expectedSample));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function typeHumanLike(
  el: HTMLElement,
  text: string,
  execCommand: (cmd: string, showUI?: boolean, value?: string) => boolean,
  wait: (ms: number) => Promise<void>,
): Promise<void> {
  const maxChars = Math.min(text.length, 300);
  for (let i = 0; i < maxChars; i += 1) {
    const char = text[i];
    el.focus();
    if (char === '\n') {
      execCommand('insertLineBreak');
    } else {
      execCommand('insertText', false, char);
    }
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: char,
        inputType: char === '\n' ? 'insertLineBreak' : 'insertText',
      }),
    );
    await wait(randomBetween(15, 60));
  }
}

export async function applyComposerTextInsertion(
  el: HTMLElement,
  text: string,
  runtime: ComposerInsertionRuntime = {},
): Promise<InsertionResult> {
  const execCommand = runtime.execCommand
    ?? ((commandId: string, showUI?: boolean, value?: string) =>
      document.execCommand(commandId, showUI ?? false, value));
  const wait = runtime.sleep ?? sleep;
  const getSelectionFn = runtime.getSelection ?? (() => window.getSelection());

  el.focus();
  await wait(300);

  execCommand('selectAll', false);
  execCommand('delete', false);
  await wait(200);

  if (text.length === 0) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { applied: true, strategy: 'paste' };
  }

  el.focus();
  placeCursorAtEnd(el, getSelectionFn);

  const dataTransfer = createDataTransfer(text);
  const pasteEvent = createPasteEvent(dataTransfer);
  el.dispatchEvent(pasteEvent);

  let strategy: InsertionStrategyLabel = 'paste';
  if (!pasteEvent.defaultPrevented) {
    execCommand('insertText', false, text);
    strategy = 'execCommand';
  }

  el.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: 'insertText',
    }),
  );

  await wait(500);

  if (!composeTextLooksApplied(el, text)) {
    execCommand('selectAll', false);
    execCommand('delete', false);
    await wait(200);
    placeCursorAtEnd(el, getSelectionFn);
    await typeHumanLike(el, text, execCommand, wait);
    await wait(500);
    strategy = 'fallback-typing';
  }

  const applied = composeTextLooksApplied(el, text);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { applied, strategy: applied ? strategy : 'failed' };
}
