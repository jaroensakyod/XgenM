import { describe, expect, it } from 'vitest';

import {
  decodeFacebookEscapedText,
  extractEmbeddedFacebookData,
} from '@content/source/facebook';

describe('facebook extraction helpers', () => {
  it('decodes escaped Facebook payload text', () => {
    expect(
      decodeFacebookEscapedText('Line 1\\nSource\\u0026More https:\\\/\\\/video.example.com\\/clip.mp4'),
    ).toBe('Line 1\nSource&More https://video.example.com/clip.mp4');
  });

  it('extracts caption and video URL from embedded payload text', () => {
    const payload = extractEmbeddedFacebookData(
      '{"playable_url_quality_hd":"https:\\/\\/video.example.com\\/hd.mp4","message":{"text":"Caption\\n#tag"}}',
    );

    expect(payload).toEqual({
      captionRaw: 'Caption\n#tag',
      videoUrl: 'https://video.example.com/hd.mp4',
    });
  });
});