// ---------------------------------------------------------------------------
// Runtime message protocol between popup ↔ background ↔ content scripts
// ---------------------------------------------------------------------------

import type {
  ComposeEvidence,
  ExtractedSourceData,
  JobPhase,
  JobState,
  RunMode,
  UserSettings,
} from './types';
import type { NewQueueEntryInput, QueueEntry } from './schedule';

// ---- Action discriminators ----

export type MessageAction =
  | 'START_JOB'
  | 'CANCEL_JOB'
  | 'GET_JOB_STATE'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  | 'GET_JOB_HISTORY'
  | 'JOB_STATE_UPDATE'
  | 'EXTRACT_SOURCE'
  | 'EXTRACTION_RESULT'
  | 'COMPOSE_POST'
  | 'UPLOAD_MEDIA'
  | 'CLICK_POST'
  | 'X_ACTION_RESULT'
  | 'FETCH_VIDEO_BLOB'
  | 'LOG'
  | 'ADD_TO_QUEUE'
  | 'REMOVE_FROM_QUEUE'
  | 'GET_QUEUE'
  | 'QUEUE_UPDATE';

// ---- Message payloads ----

export interface StartJobMessage {
  action: 'START_JOB';
  sourceUrl: string;
  mode: RunMode;
  captionOverride?: string;
}

export interface CancelJobMessage {
  action: 'CANCEL_JOB';
}

export interface GetJobStateMessage {
  action: 'GET_JOB_STATE';
}

export interface GetSettingsMessage {
  action: 'GET_SETTINGS';
}

export interface SaveSettingsMessage {
  action: 'SAVE_SETTINGS';
  settings: Partial<UserSettings>;
}

export interface GetJobHistoryMessage {
  action: 'GET_JOB_HISTORY';
}

export interface JobStateUpdateMessage {
  action: 'JOB_STATE_UPDATE';
  state: JobState;
}

export interface ExtractSourceMessage {
  action: 'EXTRACT_SOURCE';
}

export interface ExtractionResultMessage {
  action: 'EXTRACTION_RESULT';
  success: boolean;
  data?: ExtractedSourceData;
  error?: string;
}

export interface ComposePostMessage {
  action: 'COMPOSE_POST';
  text: string;
}

export interface UploadMediaMessage {
  action: 'UPLOAD_MEDIA';
  videoDataUrl: string; // base64 data URL for transfer
  fileName: string;
}

export interface ClickPostMessage {
  action: 'CLICK_POST';
}

export interface XActionResultMessage {
  action: 'X_ACTION_RESULT';
  step: 'compose' | 'upload' | 'post';
  success: boolean;
  error?: string;
  /** Structured compose evidence (present only when step === 'compose') */
  evidence?: ComposeEvidence;
}

export interface FetchVideoBlobMessage {
  action: 'FETCH_VIDEO_BLOB';
  videoUrl?: string;
}

export interface LogMessage {
  action: 'LOG';
  text: string;
  phase?: JobPhase;
}

// ---- Queue messages ----

/** Popup → Background: add a new job to the queue */
export interface AddToQueueMessage {
  action: 'ADD_TO_QUEUE';
  entry: NewQueueEntryInput;
}

/** Popup → Background: cancel/remove a pending queue entry */
export interface RemoveFromQueueMessage {
  action: 'REMOVE_FROM_QUEUE';
  id: string;
}

/** Popup → Background: request current queue state */
export interface GetQueueMessage {
  action: 'GET_QUEUE';
}

/** Background → Popup: broadcast updated queue state */
export interface QueueUpdateMessage {
  action: 'QUEUE_UPDATE';
  entries: QueueEntry[];
}

// ---- Union ----

export type RuntimeMessage =
  | StartJobMessage
  | CancelJobMessage
  | GetJobStateMessage
  | GetSettingsMessage
  | SaveSettingsMessage
  | GetJobHistoryMessage
  | JobStateUpdateMessage
  | ExtractSourceMessage
  | ExtractionResultMessage
  | ComposePostMessage
  | UploadMediaMessage
  | ClickPostMessage
  | XActionResultMessage
  | FetchVideoBlobMessage
  | LogMessage
  | AddToQueueMessage
  | RemoveFromQueueMessage
  | GetQueueMessage
  | QueueUpdateMessage;
