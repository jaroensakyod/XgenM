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
    execCommand('insertText', false, chunk);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: chunk }));
    await wait(Math.min(220, Math.max(60, chunk.length * 18)));
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
}
