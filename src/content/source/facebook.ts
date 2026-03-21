// ---------------------------------------------------------------------------
// facebook.ts — content script for Facebook Reel pages (Phase 2)
//
// Facebook Reel extraction is architecturally supported but expected to be
// less reliable than TikTok due to frequent markup changes and guarded
// media URLs. This module provides a best-effort extraction flow.
// ---------------------------------------------------------------------------

import type { ExtractedSourceData, ExtractionMethod } from '@shared/types';
import type { ExtractionResultMessage, RuntimeMessage } from '@shared/messages';
import { extractHashtags } from '@shared/text';
import { runInPageContext } from './page-bridge';

// ---------------------------------------------------------------------------
// Selectors (Facebook markup changes often — keep multiple fallbacks)
// ---------------------------------------------------------------------------

const CAPTION_SELECTORS = [
  'div[data-ad-rendering-role="story_message"] span',
  'div[dir="auto"][style] span',
  'div[data-testid="post_message"] span',
  'span.x193iq5w',
];

const VIDEO_SELECTORS = [
  'video[src]',
  'video source[src]',
  'video',
];

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function queryFirst(selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  return '';
}

function findVideoUrl(): { url: string | undefined; method: ExtractionMethod } {
  for (const sel of VIDEO_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;

    if (el.tagName === 'SOURCE' && (el as HTMLSourceElement).src) {
      const src = (el as HTMLSourceElement).src;
      if (!src.startsWith('blob:')) return { url: src, method: 'video-tag' };
    }
    if (el.tagName === 'VIDEO') {
      const video = el as HTMLVideoElement;
      if (video.src && !video.src.startsWith('blob:')) {
        return { url: video.src, method: 'video-tag' };
      }
      const source = video.querySelector('source[src]') as HTMLSourceElement | null;
      if (source?.src && !source.src.startsWith('blob:')) {
        return { url: source.src, method: 'video-tag' };
      }
    }
  }
  return { url: undefined, method: 'unknown' };
}

async function tryReactPayload(): Promise<string | undefined> {
  try {
    return await runInPageContext(() => {
      // Facebook sometimes has video URLs in script tags as JSON
      const scripts = document.querySelectorAll('script[type="application/json"]');
      for (const s of scripts) {
        try {
          const text = s.textContent ?? '';
          // Look for HD video URL patterns
          const hdMatch = text.match(/"hd_src":"(https?:[^"]+)"/);
          if (hdMatch?.[1]) return hdMatch[1].replace(/\\\//g, '/');

          const sdMatch = text.match(/"sd_src":"(https?:[^"]+)"/);
          if (sdMatch?.[1]) return sdMatch[1].replace(/\\\//g, '/');
        } catch {
          continue;
        }
      }
      return undefined;
    });
  } catch {
    return undefined;
  }
}

async function extract(): Promise<ExtractedSourceData> {
  const captionRaw = queryFirst(CAPTION_SELECTORS);
  const hashtags = extractHashtags(captionRaw);

  let { url: videoUrl, method: extractionMethod } = findVideoUrl();

  if (!videoUrl) {
    const payloadUrl = await tryReactPayload();
    if (payloadUrl) {
      videoUrl = payloadUrl;
      extractionMethod = 'embedded-state';
    }
  }

  return {
    platform: 'facebook',
    sourceUrl: window.location.href,
    canonicalUrl: window.location.href.split('?')[0],
    captionRaw,
    hashtags,
    videoUrl,
    videoMimeType: 'video/mp4',
    extractionMethod,
  };
}

// ---------------------------------------------------------------------------
// Video blob fetch helper
// ---------------------------------------------------------------------------

async function fetchVideoBlob(): Promise<{ success: boolean; dataUrl?: string }> {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  if (!video?.src) return { success: false };

  try {
    const resp = await fetch(video.src);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ success: true, dataUrl: reader.result as string });
      reader.onerror = () => resolve({ success: false });
      reader.readAsDataURL(blob);
    });
  } catch {
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage & { action: string }, _sender, sendResponse) => {
    if (message.action === 'EXTRACT_SOURCE') {
      extract()
        .then((data) => {
          const result: ExtractionResultMessage = {
            action: 'EXTRACTION_RESULT',
            success: true,
            data,
          };
          sendResponse(result);
        })
        .catch((err) => {
          const result: ExtractionResultMessage = {
            action: 'EXTRACTION_RESULT',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
          sendResponse(result);
        });
      return true;
    }

    if (message.action === 'FETCH_VIDEO_BLOB') {
      fetchVideoBlob().then(sendResponse).catch(() => sendResponse({ success: false }));
      return true;
    }
  },
);

console.log('[CrossPost] Facebook content script loaded.');
