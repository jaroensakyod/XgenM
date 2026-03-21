// ---------------------------------------------------------------------------
// Application-wide constants
// ---------------------------------------------------------------------------

/** Maximum character count for an X post */
export const X_MAX_CHARS = 280;

/** Timeout (ms) to wait for a DOM element before giving up */
export const ELEMENT_WAIT_TIMEOUT = 15_000;

/** Polling interval (ms) when waiting for elements */
export const ELEMENT_POLL_INTERVAL = 500;

/** Timeout (ms) for video fetch / download */
export const VIDEO_FETCH_TIMEOUT = 60_000;

/** Timeout (ms) for source extraction from the page */
export const EXTRACTION_TIMEOUT = 15_000;

/** Timeout (ms) for page-bridge execution in the page context */
export const PAGE_BRIDGE_TIMEOUT = 4_000;

/** Timeout (ms) for long-running page-context fetches such as video downloads */
export const PAGE_FETCH_TIMEOUT = 120_000;

/** Timeout (ms) for X media upload to finish processing */
export const UPLOAD_WAIT_TIMEOUT = 90_000;

/** Default delay (ms) between automated UI interactions */
export const ACTION_DELAY = 800;

/** Max hashtags to include by default */
export const DEFAULT_MAX_HASHTAGS = 5;

/** Supported TikTok URL patterns */
export const TIKTOK_URL_PATTERNS = [
  /https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/i,
  /https?:\/\/vm\.tiktok\.com\/[\w-]+/i,
  /https?:\/\/(www\.)?tiktok\.com\/t\/[\w-]+/i,
];

/** Supported Facebook Reel URL patterns */
export const FACEBOOK_URL_PATTERNS = [
  /https?:\/\/(www\.)?facebook\.com\/reel\/\d+/i,
  /https?:\/\/(www\.)?facebook\.com\/[\w.-]+\/videos\/\d+/i,
  /https?:\/\/fb\.watch\/[\w-]+/i,
];

/** Extension storage keys */
export const STORAGE_KEYS = {
  SETTINGS: 'xgenm_settings',
  LAST_JOB: 'xgenm_last_job',
  JOB_HISTORY: 'xgenm_job_history',
} as const;
