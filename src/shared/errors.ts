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
