// ---------------------------------------------------------------------------
// URL detection and classification utilities
// ---------------------------------------------------------------------------

import type { SourcePlatform } from './types';
import { TIKTOK_URL_PATTERNS, FACEBOOK_URL_PATTERNS } from './constants';

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Detect the source platform from a URL, or return null if unsupported.
 */
export function detectPlatform(url: string): SourcePlatform | null {
  if (TIKTOK_URL_PATTERNS.some((re) => re.test(url))) return 'tiktok';
  if (FACEBOOK_URL_PATTERNS.some((re) => re.test(url))) return 'facebook';
  return null;
}

/**
 * Returns true when the URL matches any supported source pattern.
 */
export function isSupportedUrl(url: string): boolean {
  return detectPlatform(url) !== null;
}

/**
 * Attempt to extract a canonical TikTok video URL from variants (short links, etc.).
 * For short links like vm.tiktok.com the actual redirect happens server-side,
 * so we just return the original and let the page resolve it.
 */
export function normalizeTikTokUrl(url: string): string {
  return url.split('?')[0]; // strip tracking params
}

/**
 * Extract the TikTok author handle from a canonical TikTok URL path.
 */
export function extractTikTokAuthorHandleFromUrl(url: string): string | undefined {
  const parsed = safeParseUrl(url);
  if (!parsed) return undefined;

  const segments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const authorSegment = segments.find((segment) => segment.startsWith('@'));
  if (!authorSegment || authorSegment.length <= 1) {
    return undefined;
  }

  return authorSegment.replace(/^@/, '');
}

/**
 * Attempt to extract a canonical Facebook Reel URL.
 */
export function normalizeFacebookUrl(url: string): string {
  return url.split('?')[0];
}

/**
 * Build a source label for attribution.
 */
export function buildSourceLabel(
  platform: SourcePlatform,
  authorHandle?: string,
): string {
  const platformName = platform === 'tiktok' ? 'TikTok' : 'Facebook';
  if (authorHandle) {
    return `${platformName} @${authorHandle.replace(/^@/, '')}`;
  }
  return platformName;
}
