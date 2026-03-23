// ---------------------------------------------------------------------------
// composer-write.ts — Text insertion into X's contenteditable composer
// ---------------------------------------------------------------------------

import { sleep } from '@shared/timing';

const PASTE_INPUT_TYPE = 'insertFromPaste';

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

function createTypingInputEvent(type: 'beforeinput' | 'input', text: string): Event {
  const init = {
    bubbles: true,
    cancelable: type === 'beforeinput',
    data: text,
    inputType: PASTE_INPUT_TYPE,
  };

  if (typeof InputEvent === 'function') {
    return new InputEvent(type, init);
  }

  const event = new Event(type, {
    bubbles: true,
    cancelable: type === 'beforeinput',
  });
  return defineEventProperties(event, {
    data: text,
    inputType: PASTE_INPUT_TYPE,
  });
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

export async function applyComposerTextInsertion(
  el: HTMLElement,
  text: string,
  runtime: ComposerInsertionRuntime = {},
): Promise<void> {
  const execCommand = runtime.execCommand
    ?? ((commandId: string, showUI?: boolean, value?: string) =>
      document.execCommand(commandId, showUI ?? false, value));
  const wait = runtime.sleep ?? sleep;

  el.focus();
  await wait(200);

  execCommand('selectAll', false);
  execCommand('delete', false);

  if (text.length > 0) {
    const dataTransfer = createDataTransfer(text);
    const pasteEvent = createPasteEvent(dataTransfer);
    const shouldContinue = el.dispatchEvent(pasteEvent)
      && el.dispatchEvent(createTypingInputEvent('beforeinput', text));

    if (shouldContinue) {
      execCommand('insertText', false, text);
    }

    el.dispatchEvent(createTypingInputEvent('input', text));
    await wait(200);
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
}
