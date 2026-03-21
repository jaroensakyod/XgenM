import { describe, expect, it } from 'vitest';

import { detectPlatform } from '@shared/url';

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