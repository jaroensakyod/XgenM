// ---------------------------------------------------------------------------
// composer-write.ts — Text insertion into X's contenteditable composer
// ---------------------------------------------------------------------------

import { sleep } from '@shared/timing';

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

function createKeyboardEvent(type: 'keydown' | 'keyup', chunk: string): Event {
  const key = chunk === '\n'
    ? 'Enter'
    : chunk.length === 1
      ? chunk
      : 'Unidentified';

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
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

function createTypingInputEvent(type: 'beforeinput' | 'input', chunk: string): Event {
  const init = {
    bubbles: true,
    cancelable: type === 'beforeinput',
    data: chunk,
    inputType: 'insertText',
  };

  if (typeof InputEvent === 'function') {
    return new InputEvent(type, init);
  }

  const event = new Event(type, {
    bubbles: true,
    cancelable: type === 'beforeinput',
  });
  Object.defineProperty(event, 'data', { value: chunk });
  Object.defineProperty(event, 'inputType', { value: 'insertText' });
  return event;
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
