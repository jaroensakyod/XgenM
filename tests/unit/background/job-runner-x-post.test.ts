import { describe, expect, it } from 'vitest';

import { buildPostText, extractHashtags, truncateForX } from '@shared/text';
import { buildSourceLabel } from '@shared/url';
import type { ExtractedSourceData, UserSettings } from '@shared/types';
import { DEFAULT_MAX_HASHTAGS } from '@shared/constants';

// ---------------------------------------------------------------------------
// Phase 1: Background-level characterization — post text preparation
//
// These tests validate the exact sequence used in job-runner.ts Phase 4
// (build post text) without importing job-runner itself, by replicating
// the same transformation pipeline with realistic TikTok payloads.
// ---------------------------------------------------------------------------

/** Default settings matching what loadSettings() returns when no overrides exist */
const defaultSettings: Pick<
  UserSettings,
  'captionTemplate' | 'includeSourceCredit' | 'maxHashtags'
> = {
  captionTemplate: '{caption}\n\n{hashtags}\n\nSource: {source}',
  includeSourceCredit: true,
  maxHashtags: DEFAULT_MAX_HASHTAGS,
};

/**
 * Replicate the exact post-text pipeline from job-runner.ts Phase 4.
 * This exists so we can test the pipeline in isolation.
 */
function preparePipelineText(
  data: ExtractedSourceData,
  settings: typeof defaultSettings,
  captionOverride?: string,
): string {
  const hashtags =
    data.hashtags.length > 0 ? data.hashtags : extractHashtags(data.captionRaw);

  const sourceLabel = buildSourceLabel(data.platform, data.authorHandle);

  return truncateForX(
    captionOverride ??
      buildPostText({
        caption: data.captionRaw,
        hashtags,
        sourceLabel,
        template: settings.captionTemplate,
        includeCredit: settings.includeSourceCredit,
        maxHashtags: settings.maxHashtags,
      }),
  );
}

function makeTikTokExtraction(
  overrides: Partial<ExtractedSourceData> = {},
): ExtractedSourceData {
  return {
    platform: 'tiktok',
    sourceUrl: 'https://www.tiktok.com/@testuser/video/1234567890',
    canonicalUrl: 'https://www.tiktok.com/@testuser/video/1234567890',
    authorName: 'Test User',
    authorHandle: 'testuser',
    captionRaw:
      'ลองดูวิดีโอนี้สิครับ สนุกมาก #fyp #trending #viral',
    hashtags: ['#fyp', '#trending', '#viral'],
    videoUrl: 'https://v16.tiktokcdn.com/video.mp4',
    videoMimeType: 'video/mp4',
    extractionMethod: 'embedded-state',
    ...overrides,
  };
}

describe('preparedPost.text pipeline (job-runner Phase 4 replica)', () => {
  it('produces non-empty text with a typical TikTok extraction', () => {
    const text = preparePipelineText(
      makeTikTokExtraction(),
      defaultSettings,
    );
    expect(text.length).toBeGreaterThan(0);
  });

  it('includes caption content in the final post', () => {
    const text = preparePipelineText(
      makeTikTokExtraction(),
      defaultSettings,
    );
    expect(text).toContain('ลองดูวิดีโอนี้สิครับ');
  });

  it('includes source credit', () => {
    const text = preparePipelineText(
      makeTikTokExtraction(),
      defaultSettings,
    );
    expect(text).toContain('TikTok @testuser');
  });

  it('respects captionOverride replacing extracted caption', () => {
    const text = preparePipelineText(
      makeTikTokExtraction(),
      defaultSettings,
      'Custom override caption for X',
    );
    expect(text).toBe('Custom override caption for X');
    expect(text).not.toContain('ลองดูวิดีโอนี้สิครับ');
  });

  it('remains non-empty when includeSourceCredit is off', () => {
    const text = preparePipelineText(makeTikTokExtraction(), {
      ...defaultSettings,
      includeSourceCredit: false,
    });
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('Source:');
  });

  it('handles extraction with empty caption but valid hashtags', () => {
    const text = preparePipelineText(
      makeTikTokExtraction({ captionRaw: '', hashtags: ['#fyp', '#viral'] }),
      defaultSettings,
    );
    // Should still produce something from hashtags/credit
    expect(typeof text).toBe('string');
  });

  it('falls back to extracting hashtags from captionRaw when hashtags array is empty', () => {
    const text = preparePipelineText(
      makeTikTokExtraction({
        captionRaw: 'Nice video #dance #funny',
        hashtags: [],
      }),
      defaultSettings,
    );
    expect(text).toContain('#dance');
    expect(text).toContain('#funny');
  });

  it('truncates long posts to fit X character limit', () => {
    const longCaption = 'word '.repeat(100);
    const text = preparePipelineText(
      makeTikTokExtraction({ captionRaw: longCaption }),
      defaultSettings,
    );
    expect(text.length).toBeLessThanOrEqual(280);
  });

  it('preserves text stability across identical calls', () => {
    const data = makeTikTokExtraction();
    const first = preparePipelineText(data, defaultSettings);
    const second = preparePipelineText(data, defaultSettings);
    expect(first).toBe(second);
  });

  it('handles extraction data with no authorHandle', () => {
    const text = preparePipelineText(
      makeTikTokExtraction({ authorHandle: undefined }),
      defaultSettings,
    );
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('TikTok');
  });

  it('uses no more than maxHashtags tags', () => {
    const manyTags = Array.from({ length: 15 }, (_, i) => `#tag${i}`);
    const text = preparePipelineText(
      makeTikTokExtraction({ hashtags: manyTags }),
      { ...defaultSettings, maxHashtags: 3 },
    );
    expect(text).toContain('#tag0');
    expect(text).toContain('#tag2');
    expect(text).not.toContain('#tag3');
  });
});
