import { describe, expect, it } from 'vitest';

import { detectPlatform, extractTikTokAuthorHandleFromUrl } from '@shared/url';

describe('detectPlatform', () => {
  it('returns tiktok for TikTok video URLs', () => {
    expect(detectPlatform('https://www.tiktok.com/@oracle/video/1234567890')).toBe(
      'tiktok',
    );
  });

  it('returns facebook for Facebook Reel URLs', () => {
    expect(detectPlatform('https://www.facebook.com/reel/1234567890')).toBe(
      'facebook',
    );
  });

  it('returns null for unsupported URLs', () => {
    expect(detectPlatform('https://example.com/not-supported')).toBeNull();
  });
});

describe('extractTikTokAuthorHandleFromUrl', () => {
  it('extracts the author handle from a standard TikTok video URL', () => {
    expect(
      extractTikTokAuthorHandleFromUrl('https://www.tiktok.com/@bts_official_bighit/video/1234567890'),
    ).toBe('bts_official_bighit');
  });

  it('extracts the author handle from a TikTok profile URL', () => {
    expect(
      extractTikTokAuthorHandleFromUrl('https://www.tiktok.com/@mphuwasit'),
    ).toBe('mphuwasit');
  });

  it('returns undefined when the URL does not contain a TikTok author segment', () => {
    expect(
      extractTikTokAuthorHandleFromUrl('https://www.tiktok.com/foryou'),
    ).toBeUndefined();
  });
});