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
import { sleep } from '@shared/timing';
import { runInPageContext } from './page-bridge';

// ---------------------------------------------------------------------------
// Selectors (Facebook markup changes often — keep multiple fallbacks)
// ---------------------------------------------------------------------------

const CAPTION_SELECTORS = [
  'div[data-ad-comet-preview="message"] span',
  'div[aria-describedby] div[dir="auto"] span',
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

const META_CAPTION_SELECTORS: Array<{ selector: string; attribute: string }> = [
  { selector: 'meta[property="og:description"]', attribute: 'content' },
  { selector: 'meta[name="description"]', attribute: 'content' },
  { selector: 'meta[property="twitter:description"]', attribute: 'content' },
];

const META_VIDEO_SELECTORS: Array<{ selector: string; attribute: string }> = [
  { selector: 'meta[property="og:video"]', attribute: 'content' },
  { selector: 'meta[property="og:video:url"]', attribute: 'content' },
  { selector: 'meta[itemprop="contentUrl"]', attribute: 'content' },
];

const EMBEDDED_VIDEO_PATTERNS = [
  /"browser_native_hd_url":"(https?:[^\"]+)"/i,
  /"browser_native_sd_url":"(https?:[^\"]+)"/i,
  /"playable_url_quality_hd":"(https?:[^\"]+)"/i,
  /"playable_url":"(https?:[^\"]+)"/i,
  /"hd_src_no_ratelimit":"(https?:[^\"]+)"/i,
  /"sd_src_no_ratelimit":"(https?:[^\"]+)"/i,
  /"hd_src":"(https?:[^\"]+)"/i,
  /"sd_src":"(https?:[^\"]+)"/i,
  /"contentUrl":"(https?:[^\"]+)"/i,
];

const EMBEDDED_CAPTION_PATTERNS = [
  /"message":\{"text":"([^\"]+)"/i,
  /"story":\{"message":\{"text":"([^\"]+)"/i,
  /"creation_story":\{.*?"message":\{"text":"([^\"]+)"/i,
  /"title":\{"text":"([^\"]+)"/i,
];

function debugLog(text: string): void {
  chrome.runtime.sendMessage({
    action: 'LOG',
    text: `[facebook] ${text}`,
    phase: 'extracting',
  }).catch(() => {});
}

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

function queryMeta(selectors: Array<{ selector: string; attribute: string }>): string {
  for (const { selector, attribute } of selectors) {
    const value = document.querySelector(selector)?.getAttribute(attribute)?.trim();
    if (value) return decodeFacebookEscapedText(value);
  }
  return '';
}

export function decodeFacebookEscapedText(value: string): string {
  return value
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/&amp;/gi, '&')
    .trim();
}

export function extractEmbeddedFacebookData(payloadText: string): {
  captionRaw?: string;
  videoUrl?: string;
} {
  const videoUrl = EMBEDDED_VIDEO_PATTERNS
    .map((pattern) => payloadText.match(pattern)?.[1])
    .find(Boolean);
  const captionRaw = EMBEDDED_CAPTION_PATTERNS
    .map((pattern) => payloadText.match(pattern)?.[1])
    .find(Boolean);

  return {
    captionRaw: captionRaw ? decodeFacebookEscapedText(captionRaw) : undefined,
    videoUrl: videoUrl ? decodeFacebookEscapedText(videoUrl) : undefined,
  };
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

async function tryReactPayload(): Promise<{ captionRaw?: string; videoUrl?: string }> {
  try {
    return await runInPageContext(() => {
      // Facebook sometimes has video URLs in script tags as JSON
      const scripts = document.querySelectorAll('script[type="application/json"]');
      for (const s of scripts) {
        try {
          const text = s.textContent ?? '';
          const extracted = {
            captionRaw: undefined as string | undefined,
            videoUrl: undefined as string | undefined,
          };

          const videoPatterns = [
            /"browser_native_hd_url":"(https?:[^\"]+)"/i,
            /"browser_native_sd_url":"(https?:[^\"]+)"/i,
            /"playable_url_quality_hd":"(https?:[^\"]+)"/i,
            /"playable_url":"(https?:[^\"]+)"/i,
            /"hd_src":"(https?:[^\"]+)"/i,
            /"sd_src":"(https?:[^\"]+)"/i,
          ];
          for (const pattern of videoPatterns) {
            const matched = text.match(pattern)?.[1];
            if (matched) {
              extracted.videoUrl = matched
                .replace(/\\u002F/gi, '/')
                .replace(/\\\//g, '/');
              break;
            }
          }

          const captionPatterns = [
            /"message":\{"text":"([^\"]+)"/i,
            /"story":\{"message":\{"text":"([^\"]+)"/i,
            /"title":\{"text":"([^\"]+)"/i,
          ];
          for (const pattern of captionPatterns) {
            const matched = text.match(pattern)?.[1];
            if (matched) {
              extracted.captionRaw = matched
                .replace(/\\u0026/gi, '&')
                .replace(/\\u002F/gi, '/')
                .replace(/\\\//g, '/')
                .replace(/\\n/g, '\n')
                .replace(/\\"/g, '"');
              break;
            }
          }

          if (extracted.videoUrl || extracted.captionRaw) {
            return extracted;
          }
        } catch {
          continue;
        }
      }
      return {};
    });
  } catch {
    return {};
  }
}

async function extractOnce(): Promise<ExtractedSourceData> {
  const captionFromDom = queryFirst(CAPTION_SELECTORS);
  const captionFromMeta = queryMeta(META_CAPTION_SELECTORS);
  let { url: videoUrl, method: extractionMethod } = findVideoUrl();

  if (!videoUrl) {
    const metaVideoUrl = queryMeta(META_VIDEO_SELECTORS);
    if (metaVideoUrl) {
      videoUrl = metaVideoUrl;
      extractionMethod = 'embedded-state';
    }
  }

  const payload = await tryReactPayload();
  if (!videoUrl && payload.videoUrl) {
    videoUrl = payload.videoUrl;
    extractionMethod = 'embedded-state';
  }

  const captionRaw = captionFromDom || payload.captionRaw || captionFromMeta;
  const hashtags = extractHashtags(captionRaw);

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

async function extract(): Promise<ExtractedSourceData> {
  const attempts = 3;
  let lastData: ExtractedSourceData | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const data = await extractOnce();
    lastData = data;
    if (data.captionRaw || data.videoUrl || attempt === attempts) {
      debugLog(
        `Extraction attempt ${attempt}/${attempts}: caption=${data.captionRaw ? 'yes' : 'no'} ` +
        `video=${data.videoUrl ? 'yes' : 'no'} method=${data.extractionMethod}`,
      );
      return data;
    }

    debugLog(`Extraction attempt ${attempt}/${attempts} returned weak Facebook data; retrying.`);
    await sleep(1_000);
  }

  return lastData ?? {
    platform: 'facebook',
    sourceUrl: window.location.href,
    canonicalUrl: window.location.href.split('?')[0],
    captionRaw: '',
    hashtags: [],
    extractionMethod: 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Video blob fetch helper
// ---------------------------------------------------------------------------

async function fetchVideoBlob(): Promise<{ success: boolean; dataUrl?: string }> {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  const sourceUrl = video?.currentSrc || video?.src;
  if (!sourceUrl) return { success: false };

  try {
    const resp = await fetch(sourceUrl);
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
