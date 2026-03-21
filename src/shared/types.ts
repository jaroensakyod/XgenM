// ---------------------------------------------------------------------------
// Domain types — shared across background, popup, and content scripts
// ---------------------------------------------------------------------------

/** Supported source platforms */
export type SourcePlatform = 'tiktok' | 'facebook';

/** Run modes exposed to the user */
export type RunMode = 'prepare-draft' | 'auto-post';

/** Ordered phases of a cross-post job */
export type JobPhase =
  | 'idle'
  | 'opening-source'
  | 'extracting'
  | 'downloading-video'
  | 'opening-x'
  | 'filling-composer'
  | 'uploading-media'
  | 'awaiting-review'
  | 'posting'
  | 'completed'
  | 'failed';

/** Method used to locate the video source */
export type ExtractionMethod =
  | 'video-tag'
  | 'embedded-state'
  | 'network-observed'
  | 'unknown';

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

/** Normalized result returned by any source content script */
export interface ExtractedSourceData {
  platform: SourcePlatform;
  sourceUrl: string;
  canonicalUrl?: string;
  authorName?: string;
  authorHandle?: string;
  captionRaw: string;
  hashtags: string[];
  videoUrl?: string;
  videoMimeType?: string;
  extractionMethod: ExtractionMethod;
}

/** Ready-to-send post payload for X */
export interface PreparedPost {
  text: string;
  fileName: string;
  sourceCredit?: string;
}

/** Full state of an in-flight job */
export interface JobState {
  jobId: string;
  mode: RunMode;
  sourceUrl: string;
  platform: SourcePlatform;
  phase: JobPhase;
  extraction?: ExtractedSourceData;
  preparedPost?: PreparedPost;
  logs: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Settings persisted in chrome.storage.local
// ---------------------------------------------------------------------------

export interface UserSettings {
  defaultMode: RunMode;
  includeSourceCredit: boolean;
  maxHashtags: number;
  captionTemplate: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultMode: 'prepare-draft',
  includeSourceCredit: true,
  maxHashtags: 5,
  captionTemplate: '{caption}\n\n{hashtags}\n\nSource: {source}',
};
