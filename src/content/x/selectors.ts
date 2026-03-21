// ---------------------------------------------------------------------------
// selectors.ts — X (Twitter) DOM selectors with fallback lists
//
// X obfuscates class names frequently. This file centralises selector
// management so breakage only requires updating one file.
// ---------------------------------------------------------------------------

/** Selectors for the main tweet composer text area */
export const COMPOSER_TEXT_SELECTORS = [
  'div[data-testid="tweetTextarea_0"] div[role="textbox"]',
  'div[data-testid="tweetTextarea_0"]',
  'div[role="textbox"][data-testid="tweetTextarea_0"]',
  'div.public-DraftEditor-content[role="textbox"]',
  'div[contenteditable="true"][role="textbox"]',
];

/** Selectors for the media upload file input */
export const MEDIA_INPUT_SELECTORS = [
  'input[data-testid="fileInput"]',
  'input[type="file"][accept*="video"]',
  'input[type="file"][accept*="image"]',
  'input[type="file"]',
];

/** Selectors for the Post / Tweet button */
export const POST_BUTTON_SELECTORS = [
  'button[data-testid="tweetButtonInline"]',
  'button[data-testid="tweetButton"]',
  'div[data-testid="tweetButtonInline"]',
  'div[data-testid="tweetButton"]',
];

/** Selectors that indicate the user is NOT logged in */
export const LOGIN_WALL_SELECTORS = [
  'a[href="/login"]',
  'a[data-testid="loginButton"]',
  'div[data-testid="google_sign_in_container"]',
];

/** Selectors for composer toolbar (used to find the media button) */
export const MEDIA_BUTTON_SELECTORS = [
  'button[data-testid="fileInput"]',
  'input[data-testid="fileInput"]',
  'div[aria-label="Add photos or video"]',
  'button[aria-label="Add photos or video"]',
];

/** Selectors indicating media upload is in progress */
export const UPLOAD_PROGRESS_SELECTORS = [
  'div[data-testid="attachments"] div[role="progressbar"]',
  'div[data-testid="attachments"] svg circle',
  'div[aria-label="Uploading"]',
];

/** Selectors indicating media upload is complete (thumbnail visible) */
export const UPLOAD_COMPLETE_SELECTORS = [
  'div[data-testid="attachments"] img[src]',
  'div[data-testid="attachments"] video',
  'div[data-testid="attachments"] [data-testid="attachmentsMedia"]',
  'div[data-testid="attachments"] [data-testid="mediaPreview"]',
  'div[data-testid="attachments"] [aria-label*="Remove media"]',
];
