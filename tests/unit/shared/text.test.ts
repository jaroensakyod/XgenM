import { describe, expect, it } from 'vitest';

import {
  buildPostText,
  extractHashtags,
  stripHashtags,
  normalizeCaption,
  truncateForX,
  charCount,
} from '@shared/text';
import { X_MAX_CHARS, DEFAULT_MAX_HASHTAGS } from '@shared/constants';

// ---------------------------------------------------------------------------
// Phase 1: Prepared-Post Characterization — text.ts unit tests
// ---------------------------------------------------------------------------

describe('extractHashtags', () => {
  it('extracts English hashtags', () => {
    expect(extractHashtags('hello #world #test')).toEqual(['#world', '#test']);
  });

  it('extracts Thai hashtags', () => {
    expect(extractHashtags('สวัสดี #ทดสอบ #หมอนวด')).toEqual([
      '#ทดสอบ',
      '#หมอนวด',
    ]);
  });

  it('deduplicates case-insensitively', () => {
    expect(extractHashtags('#Hello #hello #HELLO')).toEqual(['#hello']);
  });

  it('returns empty array when no hashtags present', () => {
    expect(extractHashtags('no hashtags here')).toEqual([]);
  });

  it('returns empty array from empty string', () => {
    expect(extractHashtags('')).toEqual([]);
  });
});

describe('stripHashtags', () => {
  it('removes hashtags and trims', () => {
    expect(stripHashtags('hello #world check #test')).toBe('hello  check');
  });

  it('returns trimmed text when no hashtags', () => {
    expect(stripHashtags('  just text  ')).toBe('just text');
  });

  it('returns empty string when only hashtags', () => {
    expect(stripHashtags('#one #two #three')).toBe('');
  });
});

describe('normalizeCaption', () => {
  it('normalizes CRLF to LF', () => {
    expect(normalizeCaption('line1\r\nline2')).toBe('line1\nline2');
  });

  it('collapses triple+ newlines to double', () => {
    expect(normalizeCaption('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims whitespace', () => {
    expect(normalizeCaption('  hello  ')).toBe('hello');
  });
});

describe('truncateForX', () => {
  it('returns text unchanged when within limit', () => {
    const text = 'Short text';
    expect(truncateForX(text)).toBe(text);
  });

  it('returns text unchanged at exactly the limit', () => {
    const text = 'a'.repeat(X_MAX_CHARS);
    expect(truncateForX(text)).toBe(text);
  });

  it('truncates text beyond limit with ellipsis', () => {
    const text = 'a'.repeat(X_MAX_CHARS + 10);
    const result = truncateForX(text);
    expect(result.length).toBeLessThanOrEqual(X_MAX_CHARS);
    expect(result.endsWith('…')).toBe(true);
  });

  it('tries to cut at word boundary for long texts', () => {
    const words = 'word '.repeat(80).trim(); // well over 280 chars
    const result = truncateForX(words);
    expect(result.length).toBeLessThanOrEqual(X_MAX_CHARS);
    expect(result.endsWith('…')).toBe(true);
  });

  it('never returns empty string for long TikTok-like captions', () => {
    const longCaption =
      'สวัสดีครับ นี่คือวิดีโอ TikTok ที่น่าสนใจมากๆ ลองดูกันเลยนะครับ ' +
      '#fyp #foryou #viral #trending '.repeat(20);
    const result = truncateForX(longCaption);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(X_MAX_CHARS);
  });

  it('respects custom maxLen', () => {
    const result = truncateForX('hello world this is a test', 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});

describe('charCount', () => {
  it('returns count and ok=true for short text', () => {
    expect(charCount('hi')).toEqual({ count: 2, ok: true });
  });

  it('returns ok=false when exceeding limit', () => {
    const result = charCount('x'.repeat(X_MAX_CHARS + 1));
    expect(result.ok).toBe(false);
  });
});

describe('buildPostText', () => {
  const defaultOptions = {
    caption: 'Check this out #fyp #trending',
    hashtags: ['#fyp', '#trending'],
    sourceLabel: 'TikTok @someuser',
    template: '{caption}\n\n{hashtags}\n\nSource: {source}',
    includeCredit: true,
    maxHashtags: DEFAULT_MAX_HASHTAGS,
  };

  it('produces non-empty text for a TikTok caption with hashtags', () => {
    const result = buildPostText(defaultOptions);
    expect(result.length).toBeGreaterThan(0);
  });

  it('strips hashtags from caption body before inserting', () => {
    const result = buildPostText(defaultOptions);
    expect(result).toContain('Check this out');
    // The caption portion should not contain inline hashtags —
    // they're placed separately via the {hashtags} placeholder.
    const lines = result.split('\n');
    const captionLine = lines[0];
    expect(captionLine).toBe('Check this out');
    expect(captionLine).not.toContain('#fyp');
  });

  it('includes hashtags in the output', () => {
    const result = buildPostText(defaultOptions);
    expect(result).toContain('#fyp');
    expect(result).toContain('#trending');
  });

  it('includes source credit when includeCredit is true', () => {
    const result = buildPostText(defaultOptions);
    expect(result).toContain('TikTok @someuser');
  });

  it('removes source line when includeCredit is false', () => {
    const result = buildPostText({
      ...defaultOptions,
      includeCredit: false,
    });
    expect(result).not.toContain('TikTok @someuser');
    expect(result).not.toContain('Source:');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not collapse entire post body when includeCredit is off', () => {
    // Critical: turning off credit must never accidentally empty the post
    const result = buildPostText({
      ...defaultOptions,
      includeCredit: false,
    });
    expect(result).toContain('Check this out');
  });

  it('handles caption override replacing extracted caption', () => {
    const result = buildPostText({
      ...defaultOptions,
      caption: 'My custom override text #custom',
    });
    expect(result).toContain('My custom override text');
  });

  it('limits hashtags to maxHashtags', () => {
    const manyTags = Array.from({ length: 10 }, (_, i) => `#tag${i}`);
    const result = buildPostText({
      ...defaultOptions,
      hashtags: manyTags,
      maxHashtags: 3,
    });
    expect(result).toContain('#tag0');
    expect(result).toContain('#tag2');
    expect(result).not.toContain('#tag3');
  });

  it('handles empty caption gracefully', () => {
    const result = buildPostText({
      ...defaultOptions,
      caption: '',
      hashtags: ['#fyp'],
    });
    // Should not throw and should contain some content
    expect(typeof result).toBe('string');
  });

  it('handles caption with only hashtags', () => {
    const result = buildPostText({
      ...defaultOptions,
      caption: '#fyp #trending #viral',
    });
    // Caption body becomes empty after strip, but hashtags section still present
    expect(result).toContain('#fyp');
  });

  it('normalizes CRLF and excessive newlines in caption', () => {
    const result = buildPostText({
      ...defaultOptions,
      caption: 'line1\r\n\r\n\r\nline2 #fyp',
    });
    // Should not contain triple newlines
    expect(result).not.toMatch(/\n{3,}/);
  });
});
