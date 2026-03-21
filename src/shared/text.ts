// ---------------------------------------------------------------------------
// Text processing utilities for captions and hashtags
// ---------------------------------------------------------------------------

import { X_MAX_CHARS, DEFAULT_MAX_HASHTAGS } from './constants';

const HASHTAG_RE = /#[\w\u0E00-\u0E7F]+/g; // includes Thai characters

/**
 * Extract unique hashtags from raw text.
 */
export function extractHashtags(text: string): string[] {
  const matches = text.match(HASHTAG_RE) ?? [];
  return [...new Set(matches.map((h) => h.toLowerCase()))];
}

/**
 * Remove hashtags from the text body (they'll be appended separately).
 */
export function stripHashtags(text: string): string {
  return text.replace(HASHTAG_RE, '').trim();
}

/**
 * Normalize raw caption text.
 */
export function normalizeCaption(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build the final post text from a template.
 *
 * Supported placeholders: {caption}, {hashtags}, {source}
 */
export function buildPostText(options: {
  caption: string;
  hashtags: string[];
  sourceLabel: string;
  template: string;
  includeCredit: boolean;
  maxHashtags: number;
}): string {
  const {
    caption,
    hashtags,
    sourceLabel,
    template,
    includeCredit,
    maxHashtags,
  } = options;

  const cleanCaption = normalizeCaption(stripHashtags(caption));
  const limitedTags = hashtags.slice(0, maxHashtags).join(' ');

  let text = template
    .replace('{caption}', cleanCaption)
    .replace('{hashtags}', limitedTags);

  if (includeCredit) {
    text = text.replace('{source}', sourceLabel);
  } else {
    // remove the source line entirely
    text = text
      .replace(/Source:\s*\{source\}/i, '')
      .replace(/\n{2,}$/g, '');
  }

  return text.trim();
}

/**
 * Truncate text to fit within X's character limit.
 * Tries to cut at a word boundary.
 */
export function truncateForX(text: string, maxLen = X_MAX_CHARS): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen - 1);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

/**
 * Return the character count and whether it's within limit.
 */
export function charCount(text: string): { count: number; ok: boolean } {
  const count = text.length;
  return { count, ok: count <= X_MAX_CHARS };
}
