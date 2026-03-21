// ---------------------------------------------------------------------------
// URL detection and classification utilities
// ---------------------------------------------------------------------------

import type { SourcePlatform } from './types';
import { TIKTOK_URL_PATTERNS, FACEBOOK_URL_PATTERNS } from './constants';

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
