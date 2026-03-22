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
// X Compose / Post evidence contract
// ---------------------------------------------------------------------------

/** Proof status classifying how reliably the composer state was verified */
export type ComposeProofStatus =
  | 'visible-only'   // Text appears in DOM but no submit-state evidence
  | 'draft-ready'    // Text verified and insertion acknowledged, safe for review
  | 'submit-ready'   // Full evidence: visible + tracked editor state matches
  | 'proof-failed';  // Verification attempted but failed

/** Structured evidence returned by the X content script after compose */
export interface ComposeEvidence {
  proofStatus: ComposeProofStatus;
  /** The selector strategy used to locate the composer */
  targetSelector: string;
  /** The insertion strategy that was applied */
  insertionStrategy: 'execCommand-insertText';
  /** Normalized visible text read back from the composer */
  visibleText: string;
  /** Whether the visible text matches the expected text */
  visibleMatchesExpected: boolean;
  /** Optional error detail if proof-failed */
  errorDetail?: string;
}

/** Determines whether an evidence object meets the threshold for auto-posting */
export function isSubmitEligible(evidence: ComposeEvidence): boolean {
  return evidence.proofStatus === 'submit-ready';
}

/** Determines whether evidence is at least good enough for draft review */
export function isDraftEligible(evidence: ComposeEvidence): boolean {
  return evidence.proofStatus === 'submit-ready'
    || evidence.proofStatus === 'draft-ready'
    || evidence.proofStatus === 'visible-only';
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
