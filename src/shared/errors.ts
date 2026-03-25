// ---------------------------------------------------------------------------
// Custom error types for clear error reporting
// ---------------------------------------------------------------------------

export class ExtensionError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly recoverable: boolean = false,
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

export type ErrorCode =
  | 'UNSUPPORTED_URL'
  | 'EXTRACTION_FAILED'
  | 'VIDEO_FETCH_FAILED'
  | 'X_LOGIN_MISSING'
  | 'X_COMPOSER_NOT_FOUND'
  | 'MEDIA_UPLOAD_FAILED'
  | 'POST_BUTTON_UNAVAILABLE'
  | 'TIMEOUT_EXCEEDED'
  | 'CANCELLED'
  | 'UNKNOWN';

/** Human-readable descriptions for each error code */
export const ERROR_DESCRIPTIONS: Record<ErrorCode, string> = {
  UNSUPPORTED_URL:
    'The URL is not a supported TikTok or Facebook Reel link.',
  EXTRACTION_FAILED:
    'Could not extract video or caption from the source page.',
  VIDEO_FETCH_FAILED:
    'Failed to download the video file from the source.',
  X_LOGIN_MISSING:
    'You are not logged in to X. Please log in and try again.',
  X_COMPOSER_NOT_FOUND:
    'Could not find the X post composer. The page layout may have changed.',
  MEDIA_UPLOAD_FAILED:
    'Failed to upload the video to X. Try again or upload manually.',
  POST_BUTTON_UNAVAILABLE:
    'Could not locate the Post button on X.',
  TIMEOUT_EXCEEDED:
    'The operation took too long and was stopped.',
  CANCELLED:
    'The job was cancelled by the user.',
  UNKNOWN:
    'An unexpected error occurred.',
};

export const ERROR_RECOVERY_HINTS: Record<ErrorCode, string> = {
  UNSUPPORTED_URL:
    'Open a supported TikTok video or Facebook Reel URL, then retry from the side panel.',
  EXTRACTION_FAILED:
    'Wait for the source page to fully render, scroll once to wake lazy content, and try again.',
  VIDEO_FETCH_FAILED:
    'Refresh the source tab and retry. If guarded media still fails, download the video manually and use draft mode.',
  X_LOGIN_MISSING:
    'Log in to X in the active browser profile and confirm the composer can open before retrying.',
  X_COMPOSER_NOT_FOUND:
    'Open X home or the new-post screen first. If the composer is visible and this still fails, selectors likely need an update.',
  MEDIA_UPLOAD_FAILED:
    'Let the X tab settle and retry once. If upload keeps failing, upload manually and continue in draft mode.',
  POST_BUTTON_UNAVAILABLE:
    'Check for disabled Post state, interstitials, or missing proof, then retry in draft mode if needed.',
  TIMEOUT_EXCEEDED:
    'Retry after the page is stable. Slow network or SPA rendering delays can trigger this timeout.',
  CANCELLED:
    'No recovery step is required. Start a new job when ready.',
  UNKNOWN:
    'Inspect the runtime logs to identify whether the failure was in extraction, video fetch, upload, composer, or submit gating.',
};
