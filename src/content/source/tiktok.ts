// ---------------------------------------------------------------------------
// tiktok.ts — content script for TikTok pages
// ---------------------------------------------------------------------------

import type { ExtractedSourceData, ExtractionMethod } from '@shared/types';
import type { ExtractionResultMessage, RuntimeMessage } from '@shared/messages';
import { extractHashtags } from '@shared/text';
import { extractTikTokAuthorHandleFromUrl } from '@shared/url';
import { fetchBlobUrlInPageContext, revokeObjectUrlInPageContext } from './page-bridge';

// ---------------------------------------------------------------------------
// Ranked selector lists (most stable → least stable)
// ---------------------------------------------------------------------------

const CAPTION_SELECTORS = [
  '[data-e2e="browse-video-desc"]',
  '[data-e2e="video-desc"]',
  '[data-e2e*="desc"]',
  'h1[data-e2e="video-desc"]',
  '[class*="caption"]',
  '[class*="Desc"]',
  '.tiktok-j2a19r-SpanText',
  'span.tiktok-j2a19r-SpanText',
  'div[class*="DivVideoInfoContainer"] span',
];

const AUTHOR_NAME_SELECTORS = [
  '[data-e2e="browse-username"]',
  '[data-e2e="video-author-uniqueid"]',
  'h3[data-e2e="video-author-uniqueid"]',
  'span[data-e2e="browse-username"]',
  'a[data-e2e="video-author-avatar"] + div span',
];

const AUTHOR_DISPLAY_SELECTORS = [
  '[data-e2e="browse-user-name"]',
  '[data-e2e="video-author-nickname"]',
  'span[data-e2e="video-author-nickname"]',
];

const VIDEO_SELECTORS = [
  'video[src]',
  'video source[src]',
  'video',
];

const META_CAPTION_SELECTORS = [
  'meta[property="og:title"]',
  'meta[name="twitter:title"]',
  'meta[property="og:description"]',
  'meta[name="description"]',
  'meta[name="twitter:description"]',
];

const META_VIDEO_SELECTORS = [
  'meta[property="og:video"]',
  'meta[property="og:video:url"]',
  'meta[name="twitter:player:stream"]',
];

const META_URL_SELECTORS = [
  'meta[property="og:url"]',
  'link[rel="canonical"]',
];

function debugLog(text: string): void {
  chrome.runtime.sendMessage({
    action: 'LOG',
    text: `[tiktok] ${text}`,
    phase: 'downloading-video',
  }).catch(() => {
    // Background may be unavailable temporarily; diagnostics are best-effort.
  });
}

function shortenUrl(url: string): string {
  if (url.length <= 96) return url;
  return `${url.slice(0, 93)}...`;
}

// ---------------------------------------------------------------------------
// Extraction logic
// ---------------------------------------------------------------------------

function queryFirst(selectors: string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function queryAllText(selectors: string[]): string[] {
  const results: string[] = [];

  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const text = el.textContent?.trim();
      if (text) results.push(text);
    }
  }

  return results;
}

function queryFirstAttr(selectors: string[], attr: 'content' | 'href' = 'content'): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const value = el?.getAttribute(attr)?.trim();
    if (value) return value;
  }
  return '';
}

function decodeEscapedValue(value: string): string {
  return value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/gi, '&')
    .replace(/\\n/g, '\n')
    .trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripTikTokTitleSuffix(value: string): string {
  return value
    .replace(/\s*[|\-]\s*TikTok\s*$/i, '')
    .replace(/^TikTok\s*[|\-:]\s*/i, '')
    .trim();
}

function sanitizeCaptionCandidate(value: string): string {
  return normalizeWhitespace(stripTikTokTitleSuffix(decodeEscapedValue(value)))
    .replace(/^['"“”]+|['"“”]+$/g, '')
    .trim();
}

function isUselessCaptionCandidate(value: string): boolean {
  if (!value) return true;

  const normalized = value.toLowerCase();
  if (/^[.\u2026\-\s]+$/.test(value)) return true;

  const exactGenericPhrases = [
    'tiktok',
    'make your day',
    'source: tiktok',
  ];
  const partialGenericPhrases = [
    'watch more exciting videos on tiktok',
    'discover videos related to',
    'login to follow creators',
  ];

  return exactGenericPhrases.includes(normalized)
    || partialGenericPhrases.some((phrase) => normalized.includes(phrase));
}

function pickCaptionCandidate(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const sanitized = sanitizeCaptionCandidate(candidate);
    if (!isUselessCaptionCandidate(sanitized)) {
      return sanitized;
    }
  }

  return '';
}

function isVisibleElement(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && el.getClientRects().length > 0;
}

async function expandCollapsedCaption(): Promise<void> {
  const candidates = [
    'button[data-e2e*="expand"]',
    'button[data-e2e*="more"]',
    '[data-e2e="browse-video-desc"] button',
    '[data-e2e="video-desc"] button',
    '[data-e2e*="desc"] button',
    'button',
    'span',
  ];

  for (const selector of candidates) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const text = normalizeWhitespace(element.textContent ?? '').toLowerCase();
      if (!text) continue;
      if (!['more', 'see more', 'more text'].includes(text)) continue;
      if (!isVisibleElement(element)) continue;

      element.click();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      return;
    }
  }
}

function findVisibleCaptionCandidate(): string {
  const scope = document.querySelector('main') ?? document.body;
  const candidates: Array<{ text: string; score: number }> = [];

  const elements = Array.from(scope.querySelectorAll<HTMLElement>('h1, h2, p, span, div'));
  for (const element of elements) {
    if (!isVisibleElement(element)) continue;
    if (element.children.length > 8) continue;

    const text = sanitizeCaptionCandidate(element.innerText || element.textContent || '');
    if (!text || isUselessCaptionCandidate(text)) continue;
    if (text.length < 8 || text.length > 240) continue;

    let score = 0;
    if (text.includes('#')) score += 100;
    if (/[\p{L}\p{N}]/u.test(text)) score += 20;
    if (element.matches('[data-e2e*="desc"], [class*="caption"], [class*="Desc"]')) score += 200;
    if (element.closest('[data-e2e*="desc"], [class*="caption"], [class*="Desc"]')) score += 100;
    score -= Math.abs(80 - text.length);

    candidates.push({ text, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.text ?? '';
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('blob:');
}

function extractCandidateFromValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const decoded = decodeEscapedValue(value);
    if (looksLikeUrl(decoded)) return decoded;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractCandidateFromValue(item);
      if (candidate) return candidate;
    }
  }

  return undefined;
}

function findFirstStringByKeys(value: unknown, keys: string[]): string | undefined {
  const queue: unknown[] = [value];
  const visited = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const [key, entry] of Object.entries(current)) {
      if (keys.includes(key)) {
        const direct = extractCandidateFromValue(entry);
        if (direct) return direct;

        if (typeof entry === 'string' && entry.trim()) {
          return decodeEscapedValue(entry);
        }
      }
      queue.push(entry);
    }
  }

  return undefined;
}

function findRegexMatch(patterns: RegExp[]): string | undefined {
  const scripts = Array.from(document.scripts);

  for (const script of scripts) {
    const text = script.textContent ?? '';
    if (!text) continue;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return decodeEscapedValue(value);
    }
  }

  return undefined;
}

function readJsonScript(selector: string): unknown | undefined {
  const script = document.querySelector(selector);
  const text = script?.textContent?.trim();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readJsonLd(): unknown[] {
  const results: unknown[] = [];

  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    const text = script.textContent?.trim();
    if (!text) continue;

    try {
      results.push(JSON.parse(text));
    } catch {
      continue;
    }
  }

  return results;
}

function findVideoUrl(): { url: string | undefined; method: ExtractionMethod } {
  let blobFallback: string | undefined;

  for (const sel of VIDEO_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;

    if (el.tagName === 'SOURCE' && (el as HTMLSourceElement).src) {
      const src = (el as HTMLSourceElement).src;
      if (!src.startsWith('blob:')) {
        return { url: src, method: 'video-tag' };
      }
      blobFallback = blobFallback ?? src;
    }

    if (el.tagName === 'VIDEO') {
      const video = el as HTMLVideoElement;
      const candidates = [video.currentSrc, video.src];

      for (const candidate of candidates) {
        if (!candidate) continue;
        if (!candidate.startsWith('blob:')) {
          return { url: candidate, method: 'video-tag' };
        }
        blobFallback = blobFallback ?? candidate;
      }

      const source = video.querySelector('source[src]') as HTMLSourceElement | null;
      if (source?.src) {
        if (!source.src.startsWith('blob:')) {
          return { url: source.src, method: 'video-tag' };
        }
        blobFallback = blobFallback ?? source.src;
      }
    }
  }

  const metaVideo = queryFirstAttr(META_VIDEO_SELECTORS);
  if (metaVideo) {
    return { url: decodeEscapedValue(metaVideo), method: 'embedded-state' };
  }

  const universalData = readJsonScript('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
  const sigiState = readJsonScript('#SIGI_STATE');
  const jsonLd = readJsonLd();
  const structuredSources = [universalData, sigiState, ...jsonLd];
  const videoKeys = ['playAddr', 'downloadAddr', 'download_url', 'contentUrl', 'src', 'urlList'];

  for (const source of structuredSources) {
    if (!source) continue;
    const candidate = findFirstStringByKeys(source, videoKeys);
    if (candidate) {
      return { url: candidate, method: 'embedded-state' };
    }
  }

  const scriptVideo = findRegexMatch([
    /"playAddr":"([^"]+)"/,
    /"downloadAddr":"([^"]+)"/,
    /"contentUrl":"([^"]+)"/,
    /"download_url":"([^"]+)"/,
    new RegExp('((?:https?:\\\\/\\\\/)[^"\\s]+)', 'i'),
  ]);
  if (scriptVideo) {
    return { url: scriptVideo, method: 'embedded-state' };
  }

  if (blobFallback) {
    return { url: blobFallback, method: 'video-tag' };
  }

  return { url: undefined, method: 'unknown' };
}

function findMetadata(): Pick<ExtractedSourceData, 'captionRaw' | 'authorHandle' | 'authorName' | 'canonicalUrl'> {
  const universalData = readJsonScript('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
  const sigiState = readJsonScript('#SIGI_STATE');
  const jsonLd = readJsonLd();
  const sources = [universalData, sigiState, ...jsonLd];

  const captionFromDom = pickCaptionCandidate(...queryAllText(CAPTION_SELECTORS));
  const captionFromMeta = queryFirstAttr(META_CAPTION_SELECTORS);
  const captionFromTitle = document.title;
  const captionFromVisibleText = findVisibleCaptionCandidate();
  const captionFromJson = sources
    .map((source) => findFirstStringByKeys(source, ['desc', 'description', 'text']))
    .find(Boolean);
  const captionFromRegex = findRegexMatch([
    /"desc":"([^"]+)"/,
    /"description":"([^"]+)"/,
    /"shareTitle":"([^"]+)"/,
  ]);

  const authorHandleFromDom = queryFirst(AUTHOR_NAME_SELECTORS);
  const authorHandleFromJson = sources
    .map((source) => findFirstStringByKeys(source, ['uniqueId', 'author', 'authorUniqueId']))
    .find(Boolean);
  const authorHandleFromRegex = findRegexMatch([
    /"uniqueId":"([^"]+)"/,
    /"author":"([^"]+)"/,
  ]);

  const authorNameFromDom = queryFirst(AUTHOR_DISPLAY_SELECTORS);
  const authorNameFromJson = sources
    .map((source) => findFirstStringByKeys(source, ['nickname', 'authorName', 'name']))
    .find(Boolean);

  const canonicalMeta = queryFirstAttr(['meta[property="og:url"]']);
  const canonicalLink = queryFirstAttr(['link[rel="canonical"]'], 'href');
  const canonicalUrl = canonicalMeta || canonicalLink || window.location.href.split('?')[0];
  const authorHandleFromUrl = extractTikTokAuthorHandleFromUrl(canonicalUrl)
    || extractTikTokAuthorHandleFromUrl(window.location.href);

  return {
    captionRaw: pickCaptionCandidate(
      captionFromDom,
      captionFromMeta,
      captionFromJson,
      captionFromRegex,
      captionFromVisibleText,
      captionFromTitle,
    ),
    authorHandle: authorHandleFromUrl || authorHandleFromDom || authorHandleFromJson || authorHandleFromRegex || undefined,
    authorName: authorNameFromDom || authorNameFromJson || undefined,
    canonicalUrl,
  };
}

async function extract(): Promise<ExtractedSourceData> {
  await expandCollapsedCaption();

  const { captionRaw, authorHandle, authorName, canonicalUrl } = findMetadata();
  const hashtags = extractHashtags(captionRaw);

  let { url: videoUrl, method: extractionMethod } = findVideoUrl();

  return {
    platform: 'tiktok',
    sourceUrl: window.location.href,
    canonicalUrl,
    authorName,
    authorHandle,
    captionRaw,
    hashtags,
    videoUrl,
    videoMimeType: 'video/mp4',
    extractionMethod,
  };
}

// ---------------------------------------------------------------------------
// Video blob fetch helper (used as a fallback by background)
// ---------------------------------------------------------------------------

async function fetchVideoBlob(videoUrlOverride?: string): Promise<{ success: boolean; dataUrl?: string }> {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  const source = video?.querySelector('source[src]') as HTMLSourceElement | null;
  const { url: extractedUrl } = findVideoUrl();

  const candidates = [...new Set([
    videoUrlOverride,
    video?.currentSrc,
    video?.src,
    source?.src,
    extractedUrl,
  ].filter((value): value is string => Boolean(value)))];

  debugLog(`Starting tab fetch with ${candidates.length} candidate URL(s).`);
  if (candidates.length === 0) {
    debugLog('No candidate video URLs were available in the page context.');
  }

  for (const candidate of candidates) {
    try {
      debugLog(`Trying candidate: ${shortenUrl(candidate)}`);

      if (!candidate.startsWith('blob:')) {
        try {
          debugLog('Attempting page-context blob fetch.');
          const pageBlobUrl = await fetchBlobUrlInPageContext(candidate);
          debugLog(`Page-context blob fetch produced ${shortenUrl(pageBlobUrl)}.`);

          try {
            const blobResp = await fetch(pageBlobUrl);
            if (!blobResp.ok) {
              debugLog(`Fetching page blob URL returned HTTP ${blobResp.status}.`);
            } else {
              const blob = await blobResp.blob();
              debugLog(`Fetched page blob URL (${Math.round(blob.size / 1024)} KiB).`);
              const dataUrl = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });

              if (dataUrl) {
                debugLog(`Page-context blob fetch succeeded (${Math.round(dataUrl.length / 1024)} KiB data URL).`);
                return { success: true, dataUrl };
              }
              debugLog('FileReader failed for the page blob URL result.');
            }
          } finally {
            revokeObjectUrlInPageContext(pageBlobUrl).catch(() => {
              // Best-effort cleanup only.
            });
          }
        } catch (error) {
          debugLog(`Page-context blob fetch failed: ${error instanceof Error ? error.message : String(error)}`);
          // Fall through to extension-context fetch.
        }
      }

      debugLog('Attempting content-script fetch fallback.');
      const resp = await fetch(candidate, {
        credentials: 'include',
        mode: 'cors',
        referrer: window.location.href,
        referrerPolicy: 'strict-origin-when-cross-origin',
        cache: 'no-store',
      });
      if (!resp.ok) {
        debugLog(`Content-script fetch returned HTTP ${resp.status}.`);
        continue;
      }

      const blob = await resp.blob();
      debugLog(`Content-script fetch received blob (${Math.round(blob.size / 1024)} KiB).`);
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });

      if (dataUrl) {
        debugLog(`Content-script fetch succeeded (${Math.round(dataUrl.length / 1024)} KiB data URL).`);
        return { success: true, dataUrl };
      }
      debugLog('FileReader failed to convert blob to data URL.');
    } catch (error) {
      debugLog(`Candidate failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
  }

  debugLog('All tab fetch candidates failed.');
  return { success: false };
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
      return true; // async response
    }

    if (message.action === 'FETCH_VIDEO_BLOB') {
      fetchVideoBlob(message.videoUrl).then(sendResponse).catch(() => sendResponse({ success: false }));
      return true;
    }
  },
);

console.log('[CrossPost] TikTok content script loaded.');
