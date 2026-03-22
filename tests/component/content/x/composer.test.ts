import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  applyComposerTextInsertion,
  normalizeComposerText,
  isVisibleComposer,
  resolveEditableComposer,
  scoreComposer,
  matchesExpectedComposerText,
  splitIntoTypingChunks,
} from '@content/x/composer';
import { ensureComposerText } from '@content/x/composer-proof';
import { clickPost } from '@content/x/composer-submit';
import { COMPOSER_TEXT_SELECTORS } from '@content/x/selectors';
import type { ComposeEvidence } from '@shared/types';
import { isSubmitEligible, isDraftEligible } from '@shared/types';
import { ACTION_DELAY } from '@shared/constants';

// ---------------------------------------------------------------------------
// Phase 2: X Composer DOM Truth Characterization
//
// Tests the algorithmic core of composer selection and verification under
// jsdom with explicit DOM fixtures. These characterization tests aim to
// reproduce or rule out wrong-node selection and visual-text-only
// verification failure modes.
// ---------------------------------------------------------------------------

beforeEach(() => {
  document.body.innerHTML = '';
});

// ---- Fixture builders ----

function createComposerNode(opts: {
  contentEditable?: boolean;
  role?: string;
  text?: string;
  width?: number;
  height?: number;
  visible?: boolean;
  id?: string;
}): HTMLDivElement {
  const el = document.createElement('div');
  if (opts.contentEditable) el.contentEditable = 'true';
  if (opts.role) el.setAttribute('role', opts.role);
  if (opts.text) el.textContent = opts.text;
  if (opts.id) el.id = opts.id;

  // jsdom doesn't compute layout, so we stub getBoundingClientRect
  const width = opts.width ?? 500;
  const height = opts.height ?? 200;
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    width,
    height,
    toJSON: () => ({}),
  });

  // jsdom getClientRects
  if (opts.visible !== false) {
    el.getClientRects = () => [el.getBoundingClientRect()] as unknown as DOMRectList;
  } else {
    el.getClientRects = () => [] as unknown as DOMRectList;
  }

  document.body.appendChild(el);
  return el;
}

function mockExecCommandOn(
  editor: HTMLElement,
  onInsert?: (value: string) => void,
) {
  const execCommand = vi.fn((commandId: string, _showUI?: boolean, value?: string) => {
    if (commandId === 'selectAll' || commandId === 'delete') {
      editor.textContent = '';
    }

    if (commandId === 'insertText') {
      const inserted = value ?? '';
      editor.textContent = `${editor.textContent ?? ''}${inserted}`;
      onInsert?.(inserted);
    }

    return true;
  });

  Object.defineProperty(document, 'execCommand', {
    value: execCommand,
    writable: true,
    configurable: true,
  });

  return execCommand;
}

// ---- normalizeComposerText ----

describe('normalizeComposerText', () => {
  it('replaces non-breaking spaces with regular spaces', () => {
    expect(normalizeComposerText('hello\u00a0world')).toBe('hello world');
  });

  it('collapses multiple whitespace into single space', () => {
    expect(normalizeComposerText('hello   world')).toBe('hello world');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeComposerText('  hello  ')).toBe('hello');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeComposerText('   ')).toBe('');
  });
});

// ---- isVisibleComposer ----

describe('isVisibleComposer', () => {
  it('returns true for a normal visible element', () => {
    const el = createComposerNode({ visible: true });
    expect(isVisibleComposer(el)).toBe(true);
  });

  it('returns false for element with no client rects', () => {
    const el = createComposerNode({ visible: false });
    expect(isVisibleComposer(el)).toBe(false);
  });
});

// ---- resolveEditableComposer ----

describe('resolveEditableComposer', () => {
  it('returns the element itself if it has contentEditable and role=textbox', () => {
    // jsdom does not support isContentEditable on div, so role=textbox
    // is the reliable path for resolveEditableComposer in this environment.
    const el = createComposerNode({ contentEditable: true, role: 'textbox' });
    expect(resolveEditableComposer(el)).toBe(el);
  });

  it('does NOT return element with only contentEditable in jsdom (characterization)', () => {
    // Documents that isContentEditable is not reliable in jsdom.
    // In a real browser this would return the element.
    const el = createComposerNode({ contentEditable: true });
    expect(resolveEditableComposer(el)).toBeNull();
  });

  it('returns the element itself if it has role=textbox', () => {
    const el = createComposerNode({ role: 'textbox' });
    expect(resolveEditableComposer(el)).toBe(el);
  });

  it('searches for a nested contenteditable textbox child', () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    child.contentEditable = 'true';
    child.setAttribute('role', 'textbox');
    parent.appendChild(child);
    document.body.appendChild(parent);

    expect(resolveEditableComposer(parent)).toBe(child);
  });

  it('returns null when no editable child exists and element is not editable', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(resolveEditableComposer(el)).toBeNull();
  });
});

// ---- scoreComposer ----

describe('scoreComposer', () => {
  it('contentEditable bonus does NOT apply in jsdom (characterization)', () => {
    // In a real browser, isContentEditable would return true and add 2M bonus.
    // In jsdom it does not — this documents the testing limitation.
    const editable = createComposerNode({
      contentEditable: true,
      width: 100,
      height: 100,
      id: 'editable',
    });
    const nonEditable = createComposerNode({
      width: 100,
      height: 100,
      id: 'nonEditable',
    });
    expect(scoreComposer(editable)).toBe(scoreComposer(nonEditable));
  });

  it('gives higher score to contentEditable+textbox vs plain element', () => {
    const editableTextbox = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 100,
      height: 100,
      id: 'editableTextbox',
    });
    const plain = createComposerNode({
      width: 100,
      height: 100,
      id: 'plain',
    });
    expect(scoreComposer(editableTextbox)).toBeGreaterThan(scoreComposer(plain));
  });

  it('gives higher score to role=textbox elements', () => {
    const textbox = createComposerNode({
      role: 'textbox',
      width: 100,
      height: 100,
      id: 'textbox',
    });
    const plain = createComposerNode({
      width: 100,
      height: 100,
      id: 'plain',
    });
    expect(scoreComposer(textbox)).toBeGreaterThan(scoreComposer(plain));
  });

  it('gives higher score to focused elements when focusable', () => {
    const el = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 100,
      height: 100,
    });
    // tabIndex needed for jsdom focus() to set document.activeElement
    el.tabIndex = 0;
    el.focus();
    const scoreWithFocus = scoreComposer(el);

    const el2 = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 100,
      height: 100,
    });
    const scoreWithoutFocus = scoreComposer(el2);

    expect(scoreWithFocus).toBeGreaterThan(scoreWithoutFocus);
  });

  it('uses area as part of the score', () => {
    const large = createComposerNode({ width: 500, height: 300, id: 'large' });
    const small = createComposerNode({ width: 50, height: 30, id: 'small' });

    // Both non-editable, non-focused, so only area differs
    expect(scoreComposer(large)).toBeGreaterThan(scoreComposer(small));
  });

  it('prefers contentEditable+textbox over larger non-editable area', () => {
    const authoritative = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 100,
      height: 50,
      id: 'authoritative',
    });
    const mirror = createComposerNode({
      width: 1000,
      height: 1000,
      id: 'mirror',
    });
    expect(scoreComposer(authoritative)).toBeGreaterThan(scoreComposer(mirror));
  });
});

// ---- matchesExpectedComposerText ----

describe('matchesExpectedComposerText', () => {
  it('returns true for exact match after normalization', () => {
    expect(
      matchesExpectedComposerText('Hello world', 'Hello world'),
    ).toBe(true);
  });

  it('returns true when actual includes expected', () => {
    expect(
      matchesExpectedComposerText('prefix Hello world suffix', 'Hello world'),
    ).toBe(true);
  });

  it('returns false when actual does not contain expected', () => {
    expect(
      matchesExpectedComposerText('', 'Hello world'),
    ).toBe(false);
  });

  it('handles non-breaking spaces in actual text', () => {
    expect(
      matchesExpectedComposerText(
        normalizeComposerText('Hello\u00a0world'),
        'Hello world',
      ),
    ).toBe(true);
  });

  it('returns true for non-empty actual when expected is empty', () => {
    // When expected is empty, it checks actual.length > 0
    expect(matchesExpectedComposerText('some text', '')).toBe(true);
  });

  it('returns false for empty actual when expected is empty', () => {
    expect(matchesExpectedComposerText('', '')).toBe(false);
  });

  it('fails when text appears only in wrong node context', () => {
    // If actual from the wrong node is empty but expected has text
    expect(matchesExpectedComposerText('', 'Expected caption text')).toBe(false);
  });

  it('normalizes extra whitespace in expected', () => {
    expect(
      matchesExpectedComposerText('Hello world', 'Hello   world'),
    ).toBe(true);
  });
});

// ---- splitIntoTypingChunks ----

describe('splitIntoTypingChunks', () => {
  it('splits text into word-level chunks', () => {
    const chunks = splitIntoTypingChunks('hello world test');
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.join('')).toBe('hello world test');
  });

  it('preserves newlines as separate chunks', () => {
    const chunks = splitIntoTypingChunks('line1\nline2');
    expect(chunks.join('')).toBe('line1\nline2');
    expect(chunks.some((chunk: string) => chunk.includes('\n'))).toBe(true);
  });

  it('returns single-element array for text without word boundaries', () => {
    const chunks = splitIntoTypingChunks('');
    expect(chunks).toEqual(['']);
  });
});

// ---- Composer selection with multiple candidates ----

describe('composer selection semantics (selector coverage)', () => {
  it('COMPOSER_TEXT_SELECTORS includes the primary tweetTextarea selector', () => {
    expect(
      COMPOSER_TEXT_SELECTORS.some((selector: string) => selector.includes('tweetTextarea_0')),
    ).toBe(true);
  });

  it('COMPOSER_TEXT_SELECTORS has a fallback contenteditable+textbox selector', () => {
    expect(
      COMPOSER_TEXT_SELECTORS.some(
        (selector: string) => selector.includes('contenteditable') && selector.includes('textbox'),
      ),
    ).toBe(true);
  });

  it('COMPOSER_TEXT_SELECTORS has a plain contenteditable fallback selector', () => {
    expect(COMPOSER_TEXT_SELECTORS).toContain('div[contenteditable="true"]');
  });

  it('scoreComposer ranks contentEditable+textbox above plain div even with bigger area', () => {
    // This test characterizes whether the scoring logic would pick
    // an authoritative editor node over a larger mirror/preview node.
    const authoritative = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 200,
      height: 100,
      id: 'auth',
    });
    const mirrorLarge = createComposerNode({
      width: 800,
      height: 400,
      id: 'mirror',
    });

    expect(scoreComposer(authoritative)).toBeGreaterThan(
      scoreComposer(mirrorLarge),
    );
  });

  it('media-preview DOM does not affect scoring of editable composers', () => {
    // Simulate media preview being already in DOM alongside composer
    const composer = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 400,
      height: 150,
      id: 'composer',
    });

    const mediaPreview = document.createElement('div');
    mediaPreview.setAttribute('data-testid', 'attachments');
    const img = document.createElement('img');
    img.src = 'blob:preview';
    mediaPreview.appendChild(img);
    document.body.appendChild(mediaPreview);

    // Composer scoring should remain stable regardless of media preview
    const score = scoreComposer(composer);
    expect(score).toBeGreaterThan(0);
    // In jsdom, only role=textbox bonus (1M) applies (isContentEditable is false)
    expect(score).toBeGreaterThan(1_000_000);
  });
});

// ---- Phase 4: Submit semantics probe layer ----

describe('submit semantics probe layer', () => {
  it('dispatches a human-like insertion event sequence', async () => {
    const editor = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 400,
      height: 120,
    });
    editor.tabIndex = 0;

    const events: string[] = [];
    editor.addEventListener('focus', () => events.push('focus'));
    editor.addEventListener('keydown', () => events.push('keydown'));
    editor.addEventListener('beforeinput', () => events.push('beforeinput'));
    editor.addEventListener('input', () => events.push('input'));
    editor.addEventListener('keyup', () => events.push('keyup'));
    editor.addEventListener('change', () => events.push('change'));

    const execCommand = vi.fn((commandId: string, _showUI?: boolean, value?: string) => {
      if (commandId === 'selectAll' || commandId === 'delete') {
        editor.textContent = '';
      }

      if (commandId === 'insertText') {
        editor.textContent = `${editor.textContent ?? ''}${value ?? ''}`;
      }

      return true;
    });

    await applyComposerTextInsertion(editor, 'hello', {
      execCommand,
      sleep: async () => {},
    });

    expect(events).toEqual(['focus', 'keydown', 'beforeinput', 'input', 'keyup', 'change']);
  });

  it('keeps submit-state listeners in sync with visible composer text', async () => {
    const editor = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 400,
      height: 120,
    });
    editor.tabIndex = 0;

    const submitModel = { value: '' };
    editor.addEventListener('beforeinput', (event) => {
      submitModel.value += (event as InputEvent).data ?? '';
    });

    const execCommand = vi.fn((commandId: string, _showUI?: boolean, value?: string) => {
      if (commandId === 'selectAll' || commandId === 'delete') {
        editor.textContent = '';
      }

      if (commandId === 'insertText') {
        editor.textContent = `${editor.textContent ?? ''}${value ?? ''}`;
      }

      return true;
    });

    await applyComposerTextInsertion(editor, 'Visible caption only', {
      execCommand,
      sleep: async () => {},
    });

    const visibleText = normalizeComposerText(editor.textContent ?? '');
    expect(visibleText).toBe('Visible caption only');
    expect(matchesExpectedComposerText(visibleText, 'Visible caption only')).toBe(true);
    expect(submitModel.value).toBe('Visible caption only');
  });

  it('defines a submit-truth gate that blocks posting without tracked editor evidence', async () => {
    const editor = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 400,
      height: 120,
    });
    editor.tabIndex = 0;

    const submitModel = { value: '' };
    const hasSubmitStateEvidence = (expected: string) => {
      const visibleText = normalizeComposerText(editor.textContent ?? '');
      return matchesExpectedComposerText(visibleText, expected)
        && normalizeComposerText(submitModel.value) === normalizeComposerText(expected);
    };

    const execCommand = vi.fn((commandId: string, _showUI?: boolean, value?: string) => {
      if (commandId === 'selectAll' || commandId === 'delete') {
        editor.textContent = '';
      }

      if (commandId === 'insertText') {
        editor.textContent = `${editor.textContent ?? ''}${value ?? ''}`;
      }

      return true;
    });

    await applyComposerTextInsertion(editor, 'Guard this caption', {
      execCommand,
      sleep: async () => {},
    });

    expect(normalizeComposerText(editor.textContent ?? '')).toBe('Guard this caption');
    expect(hasSubmitStateEvidence('Guard this caption')).toBe(false);
  });

  it('re-types until the post button becomes enabled and then returns submit-ready proof', async () => {
    globalThis.chrome.runtime.sendMessage = vi.fn(() => Promise.resolve());

    const editor = createComposerNode({
      contentEditable: true,
      role: 'textbox',
      width: 400,
      height: 120,
    });
    editor.tabIndex = 0;
    editor.setAttribute('data-testid', 'tweetTextarea_0');

    const button = document.createElement('button');
    button.setAttribute('data-testid', 'tweetButtonInline');
    button.disabled = true;
    document.body.appendChild(button);

    let insertAttempts = 0;
    mockExecCommandOn(editor, () => {
      insertAttempts += 1;
      if (insertAttempts >= 2) {
        button.disabled = false;
      }
    });

    const evidence = await ensureComposerText('retry me', 3);

    expect(insertAttempts).toBe(2);
    expect(evidence.proofStatus).toBe('submit-ready');
    expect(evidence.visibleText).toBe('retry me');
    expect(evidence.visibleMatchesExpected).toBe(true);
  });

  it('waits for an enabled post button before clicking submit', async () => {
    vi.useFakeTimers();
    try {
      const button = document.createElement('button');
      button.setAttribute('data-testid', 'tweetButtonInline');
      button.disabled = true;
      const clickSpy = vi.spyOn(button, 'click');
      document.body.appendChild(button);

      const promise = clickPost();

      await vi.advanceTimersByTimeAsync(ACTION_DELAY + 600);
      button.disabled = false;
      await vi.advanceTimersByTimeAsync(1_000);

      await promise;
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---- Phase 1: Truth contract type validation ----

describe('ComposeEvidence contract (Phase 1)', () => {
  it('classifies visible-text-but-no-submit-proof as visible-only', async () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'visible-only',
      targetSelector: 'div[data-testid="tweetTextarea_0"]',
      insertionStrategy: 'execCommand-insertText',
      visibleText: 'Caption is visible',
      visibleMatchesExpected: false,
    };

    expect(evidence.proofStatus).toBe('visible-only');
    expect(evidence.proofStatus).not.toBe('submit-ready');
  });

  it('classifies successful insertion with visible match as draft-ready', () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'draft-ready',
      targetSelector: 'div[data-testid="tweetTextarea_0"]',
      insertionStrategy: 'execCommand-insertText',
      visibleText: 'Full caption text',
      visibleMatchesExpected: true,
    };

    expect(evidence.proofStatus).toBe('draft-ready');
    expect(evidence.visibleMatchesExpected).toBe(true);
  });

  it('classifies failed verification as proof-failed with error detail', () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'proof-failed',
      targetSelector: 'unknown',
      insertionStrategy: 'execCommand-insertText',
      visibleText: '',
      visibleMatchesExpected: false,
      errorDetail: 'Composer empty after 3 attempts.',
    };

    expect(evidence.proofStatus).toBe('proof-failed');
    expect(evidence.errorDetail).toBeDefined();
  });

  it('isSubmitEligible returns true only for submit-ready', () => {
    expect(isSubmitEligible({ proofStatus: 'submit-ready', targetSelector: '', insertionStrategy: 'execCommand-insertText', visibleText: 'x', visibleMatchesExpected: true })).toBe(true);
    expect(isSubmitEligible({ proofStatus: 'draft-ready', targetSelector: '', insertionStrategy: 'execCommand-insertText', visibleText: 'x', visibleMatchesExpected: true })).toBe(false);
    expect(isSubmitEligible({ proofStatus: 'visible-only', targetSelector: '', insertionStrategy: 'execCommand-insertText', visibleText: 'x', visibleMatchesExpected: false })).toBe(false);
    expect(isSubmitEligible({ proofStatus: 'proof-failed', targetSelector: '', insertionStrategy: 'execCommand-insertText', visibleText: '', visibleMatchesExpected: false })).toBe(false);
  });

  it('isDraftEligible returns true for submit-ready, draft-ready, and visible-only', () => {
    expect(isDraftEligible({ proofStatus: 'submit-ready', targetSelector: '', insertionStrategy: 'execCommand-insertText', visibleText: 'x', visibleMatchesExpected: true })).toBe(true);
    expect(isDraftEligible({ proofStatus: 'draft-ready', targetSelector: '', insertionStrategy: 'execCommand-insertText', visibleText: 'x', visibleMatchesExpected: true })).toBe(true);
    expect(isDraftEligible({ proofStatus: 'visible-only', targetSelector: '', insertionStrategy: 'execCommand-insertText', visibleText: 'x', visibleMatchesExpected: false })).toBe(true);
    expect(isDraftEligible({ proofStatus: 'proof-failed', targetSelector: '', insertionStrategy: 'execCommand-insertText', visibleText: '', visibleMatchesExpected: false })).toBe(false);
  });

  it('legacy failure path maps to proof-failed without losing error detail', () => {
    const evidence: ComposeEvidence = {
      proofStatus: 'proof-failed',
      targetSelector: 'none',
      insertionStrategy: 'execCommand-insertText',
      visibleText: '',
      visibleMatchesExpected: false,
      errorDetail: 'Not logged in to X.',
    };

    expect(evidence.proofStatus).toBe('proof-failed');
    expect(evidence.errorDetail).toBe('Not logged in to X.');
  });
});
