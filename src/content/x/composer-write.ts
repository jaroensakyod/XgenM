// ---------------------------------------------------------------------------
// composer-write.ts — Text insertion into X's contenteditable composer
// ---------------------------------------------------------------------------

import { sleep } from '@shared/timing';

const INSERT_TEXT_INPUT_TYPE = 'insertText';

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

export function splitIntoTypingChunks(text: string): string[] {
  const matches = text.match(/\S+\s*|\n+/g);
  return matches && matches.length > 0 ? matches : [text];
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

function createKeyboardEvent(type: 'keydown' | 'keyup', chunk: string): Event {
  let key = 'Unidentified';
  if (chunk === '\n') {
    key = 'Enter';
  } else if (chunk.length === 1) {
    key = chunk;
  }

  if (typeof KeyboardEvent === 'function') {
    return new KeyboardEvent(type, {
      bubbles: true,
      cancelable: type === 'keydown',
      key,
    });
  }

  const event = new Event(type, {
    bubbles: true,
    cancelable: type === 'keydown',
  });
  return defineEventProperties(event, { key });
}

function createTypingInputEvent(type: 'beforeinput' | 'input', chunk: string): Event {
  const init = {
    bubbles: true,
    cancelable: type === 'beforeinput',
    data: chunk,
    inputType: INSERT_TEXT_INPUT_TYPE,
  };

  if (typeof InputEvent === 'function') {
    return new InputEvent(type, init);
  }

  const event = new Event(type, {
    bubbles: true,
    cancelable: type === 'beforeinput',
  });
  return defineEventProperties(event, {
    data: chunk,
    inputType: INSERT_TEXT_INPUT_TYPE,
  });
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

  for (const chunk of splitIntoTypingChunks(text)) {
    el.dispatchEvent(createKeyboardEvent('keydown', chunk));
    const beforeInput = createTypingInputEvent('beforeinput', chunk);
    const shouldInsert = el.dispatchEvent(beforeInput);

    if (shouldInsert) {
      execCommand('insertText', false, chunk);
    }

    el.dispatchEvent(createTypingInputEvent('input', chunk));
    el.dispatchEvent(createKeyboardEvent('keyup', chunk));
    await wait(Math.min(220, Math.max(60, chunk.length * 18)));
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
}
