// ---------------------------------------------------------------------------
// job-runner.ts — orchestrates the full cross-post pipeline
// ---------------------------------------------------------------------------

import type {
  JobState,
  ExtractedSourceData,
  PreparedPost,
  RunMode,
  SourcePlatform,
} from '@shared/types';
import type {
  ExtractionResultMessage,
  XActionResultMessage,
} from '@shared/messages';
import {
  ACTION_DELAY,
  EXTRACTION_TIMEOUT,
  VIDEO_FETCH_TIMEOUT,
} from '@shared/constants';
import { detectPlatform, extractTikTokAuthorHandleFromUrl } from '@shared/url';
import { buildPostText, extractHashtags, truncateForX } from '@shared/text';
import { buildSourceLabel } from '@shared/url';
import { sleep } from '@shared/timing';
import { ERROR_DESCRIPTIONS, ExtensionError } from '@shared/errors';
import { openOrFocusTab, waitForTabLoad, sendToTab } from './tab-manager';
import { loadSettings, saveLastJob, appendJobHistory } from './storage';
import { runXPostSession } from './x-post-session';

// ---------------------------------------------------------------------------
// Queue integration — imported lazily to avoid circular dependency risk
// These are called only at job terminal states (completed/failed).
// ---------------------------------------------------------------------------

async function notifyQueueOnJobEnd(
  jobId: string,
  outcome: 'completed' | 'failed',
  failureReason?: string,
): Promise<void> {
  try {
    // Dynamic import to keep job-runner testable without full queue setup
    const { loadQueue, setEntryStatus } = await import('./job-queue');
    const { setNextAlarm } = await import('./alarm-manager');

    const entries = await loadQueue();
    // Find the running entry that corresponds to this job execution.
    // We match by status='running' — at most one entry can be running at a time.
    const running = entries.find((e) => e.status === 'running');
    if (running) {
      await setEntryStatus(running.id, outcome, failureReason ? { failureReason } : undefined);
    }

    // Reload queue after update and schedule the next alarm
    const updated = await loadQueue();
    await setNextAlarm(updated);

    // Broadcast queue state to any open popup (mirror of broadcastQueueUpdate in index.ts)
    chrome.runtime.sendMessage({ action: 'QUEUE_UPDATE', entries: await loadQueue() }).catch(() => {});
  } catch (err) {
    console.error('[job-runner] notifyQueueOnJobEnd error', err);
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentJob: JobState | null = null;
const BUILD_MARKER = '2026-03-21-upload-first-v2';

export function getCurrentJob(): JobState | null {
  return currentJob;
}

export function appendRuntimeLog(text: string): void {
  log(text);
}

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

function broadcast(job: JobState): void {
  job.updatedAt = new Date().toISOString();
  chrome.runtime.sendMessage({ action: 'JOB_STATE_UPDATE', state: job }).catch(() => {
    // popup may be closed — ignore
  });
  saveLastJob(job);
}

function log(text: string): void {
  if (!currentJob) return;
  currentJob.logs.push(`[${new Date().toLocaleTimeString()}] ${text}`);
  broadcast(currentJob);
}

function decodeEscapedText(value: string): string {
  return value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/gi, '&')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
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

function sanitizeTikTokCaptionCandidate(value: string): string {
  return normalizeWhitespace(stripTikTokTitleSuffix(decodeEscapedText(value)))
    .replace(/^['"“”]+|['"“”]+$/g, '')
    .trim();
}

function isUselessTikTokCaptionCandidate(value: string): boolean {
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

function pickBestTikTokCaption(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const sanitized = sanitizeTikTokCaptionCandidate(candidate);
    if (!isUselessTikTokCaptionCandidate(sanitized)) {
      return sanitized;
    }
  }

  return '';
}

function findFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return decodeEscapedText(match[1]);
    }
  }

  return undefined;
}

function extractMetaContent(html: string, key: string, attribute: 'property' | 'name'): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i',
  );
  return findFirstMatch(html, [pattern]);
}

function extractTitleTagContent(html: string): string | undefined {
  return findFirstMatch(html, [/<title[^>]*>([^<]+)<\/title>/i]);
}

function mergeExtractionData(
  base: ExtractedSourceData,
  fallback: Partial<ExtractedSourceData>,
): ExtractedSourceData {
  return {
    ...base,
    canonicalUrl: base.canonicalUrl || fallback.canonicalUrl,
    authorName: base.authorName || fallback.authorName,
    authorHandle: base.authorHandle || fallback.authorHandle,
    captionRaw: base.captionRaw || fallback.captionRaw || '',
    hashtags: base.hashtags.length > 0 ? base.hashtags : fallback.hashtags ?? [],
    videoUrl: base.videoUrl || fallback.videoUrl,
    videoMimeType: base.videoMimeType || fallback.videoMimeType,
    extractionMethod:
      base.videoUrl || base.captionRaw || base.authorHandle
        ? base.extractionMethod
        : (fallback.extractionMethod ?? base.extractionMethod),
  };
}

async function fetchTikTokPageFallback(sourceUrl: string): Promise<Partial<ExtractedSourceData> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT);
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      redirect: 'follow',
      credentials: 'omit',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const captionRaw = pickBestTikTokCaption(
      extractMetaContent(html, 'og:description', 'property'),
      extractMetaContent(html, 'description', 'name'),
      extractMetaContent(html, 'twitter:description', 'name'),
      extractMetaContent(html, 'og:title', 'property'),
      extractMetaContent(html, 'twitter:title', 'name'),
      findFirstMatch(html, [
        /"desc":"([^"]+)"/,
        /"description":"([^"]+)"/,
        /"shareTitle":"([^"]+)"/,
      ]),
      extractTitleTagContent(html),
    );
    const authorHandle = findFirstMatch(html, [
      /"uniqueId":"([^"]+)"/,
      /"authorUniqueId":"([^"]+)"/,
      /"author":"([^"]+)"/,
    ]);
    const authorName = findFirstMatch(html, [
      /"nickname":"([^"]+)"/,
      /"authorName":"([^"]+)"/,
      /"name":"([^"]+)"/,
    ]);
    const videoUrl =
      extractMetaContent(html, 'og:video', 'property') ||
      extractMetaContent(html, 'og:video:url', 'property') ||
      extractMetaContent(html, 'twitter:player:stream', 'name') ||
      findFirstMatch(html, [
        /"playAddr":"([^"]+)"/,
        /"downloadAddr":"([^"]+)"/,
        /"contentUrl":"([^"]+)"/,
        /"download_url":"([^"]+)"/,
      ]);
    const canonicalUrl =
      extractMetaContent(html, 'og:url', 'property') ||
      findFirstMatch(html, [/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i]) ||
      sourceUrl;
    const authorHandleFromUrl = extractTikTokAuthorHandleFromUrl(canonicalUrl)
      || extractTikTokAuthorHandleFromUrl(sourceUrl);

    if (!captionRaw && !authorHandle && !authorName && !videoUrl) {
      return null;
    }

    return {
      platform: 'tiktok',
      sourceUrl,
      canonicalUrl,
      authorName,
      authorHandle: authorHandleFromUrl || authorHandle,
      captionRaw,
      hashtags: extractHashtags(captionRaw),
      videoUrl,
      videoMimeType: videoUrl ? 'video/mp4' : undefined,
      extractionMethod: videoUrl ? 'embedded-state' : 'unknown',
    };
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function hasMeaningfulText(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim();
  return normalized.length > 3 && normalized !== '…' && normalized !== '...';
}

function needsTikTokExtractionRetry(data: ExtractedSourceData): boolean {
  return !hasMeaningfulText(data.captionRaw) || data.captionRaw === 'Source: TikTok';
}

async function extractSourceDataWithRetries(sourceTabId: number, platform: SourcePlatform): Promise<ExtractionResultMessage> {
  const attempts = platform === 'tiktok' ? 3 : 1;

  let lastResult: ExtractionResultMessage | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const extraction = await withTimeout(
      sendToTab<ExtractionResultMessage>(
        sourceTabId,
        { action: 'EXTRACT_SOURCE' },
      ),
      EXTRACTION_TIMEOUT,
      'Extraction timed out while waiting for the source page.',
    );

    lastResult = extraction;
    if (!extraction.success || !extraction.data) {
      return extraction;
    }

    if (platform !== 'tiktok' || !needsTikTokExtractionRetry(extraction.data) || attempt === attempts) {
      return extraction;
    }

    log(`TikTok caption still incomplete — retrying extraction (${attempt + 1}/${attempts})…`);
    await sleep(1_500);
  }

  return lastResult ?? {
    action: 'EXTRACTION_RESULT',
    success: false,
    error: 'Extraction failed',
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function startJob(
  sourceUrl: string,
  mode: RunMode,
  captionOverride?: string,
): Promise<void> {
  const platform = detectPlatform(sourceUrl);
  if (!platform) {
    throw new ExtensionError(
      'Unsupported URL',
      'UNSUPPORTED_URL',
    );
  }

  currentJob = {
    jobId: `job_${Date.now()}`,
    mode,
    sourceUrl,
    platform,
    phase: 'idle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [],
  };

  try {
    log(`Runtime build: ${BUILD_MARKER}`);

    // ---- Phase 1: Open source page ----
    currentJob.phase = 'opening-source';
    log(`Opening ${platform} page…`);
    broadcast(currentJob);

    const sourceTab = await openOrFocusTab(sourceUrl);
    if (!sourceTab.id) throw new ExtensionError('Tab failed', 'UNKNOWN');
    await waitForTabLoad(sourceTab.id);
    await sleep(ACTION_DELAY); // let SPA settle

    // ---- Phase 2: Extract ----
    currentJob.phase = 'extracting';
    log('Extracting caption, hashtags, and video…');
    broadcast(currentJob);

    const extraction = await extractSourceDataWithRetries(sourceTab.id, platform);

    if (!extraction.success || !extraction.data) {
      throw new ExtensionError(
        extraction.error ?? 'Extraction failed',
        'EXTRACTION_FAILED',
      );
    }

    let data: ExtractedSourceData = extraction.data;

    if (
      platform === 'tiktok' &&
      (!data.videoUrl || (!data.captionRaw && !data.authorHandle && !data.authorName))
    ) {
      log('Page extraction incomplete — trying TikTok HTML fallback…');
      const fallbackData = await fetchTikTokPageFallback(sourceUrl);
      if (fallbackData) {
        data = mergeExtractionData(data, fallbackData);
        log(`HTML fallback: ${data.videoUrl ? 'video found' : 'video not found'}.`);
      } else {
        log('HTML fallback did not return usable TikTok data.');
      }
    }

    currentJob.extraction = data;
    log(`Extracted: "${data.captionRaw.slice(0, 60)}…" (${data.hashtags.length} tags)`);
    log(`Video URL: ${data.videoUrl ? 'found' : 'NOT found'}`);
    log(`Extraction method: ${data.extractionMethod}`);

    // ---- Phase 3: Download video ----
    currentJob.phase = 'downloading-video';
    broadcast(currentJob);

    let videoDataUrl: string | undefined;
    if (data.videoUrl) {
      log('Downloading video…');
      videoDataUrl = await fetchVideoAsDataUrl(data.videoUrl, sourceTab.id);
      log('Video downloaded successfully.');
    } else {
      log('No direct video URL — will attempt tab-context download fallback.');
      videoDataUrl = await fetchVideoViaTab(sourceTab.id, data.videoUrl);
      if (!videoDataUrl) {
        throw new ExtensionError(
          'Could not obtain video file',
          'VIDEO_FETCH_FAILED',
        );
      }
      log('Video obtained via tab-context fallback.');
    }

    // ---- Phase 4: Build post text ----
    const settings = await loadSettings();
    const hashtags =
      data.hashtags.length > 0
        ? data.hashtags
        : extractHashtags(data.captionRaw);

    const sourceLabel = buildSourceLabel(platform, data.authorHandle);

    const postText = truncateForX(
      captionOverride ??
        buildPostText({
          caption: data.captionRaw,
          hashtags,
          sourceLabel,
          template: settings.captionTemplate,
          includeCredit: settings.includeSourceCredit,
          maxHashtags: settings.maxHashtags,
        }),
    );

    const fileName = `${platform}-${Date.now()}.mp4`;

    const preparedPost: PreparedPost = {
      text: postText,
      fileName,
      sourceCredit: settings.includeSourceCredit ? sourceLabel : undefined,
    };
    currentJob.preparedPost = preparedPost;
    log(`Prepared post text: "${postText.slice(0, 80)}${postText.length > 80 ? '…' : ''}"`);

    // ---- Phase 5: Open X ----
    currentJob.phase = 'opening-x';
    log('Opening X…');
    broadcast(currentJob);

    const xTab = await openOrFocusTab('https://x.com/home');
    if (!xTab.id) throw new ExtensionError('Tab failed', 'UNKNOWN');
    await waitForTabLoad(xTab.id);
    await sleep(ACTION_DELAY);

    // ---- Phase 6: Upload media ----
    if (videoDataUrl) {
      currentJob.phase = 'uploading-media';
      log('Uploading media to X…');
      broadcast(currentJob);

      const uploadResult = await sendToTab<XActionResultMessage>(xTab.id, {
        action: 'UPLOAD_MEDIA',
        videoDataUrl,
        fileName,
      });

      if (!uploadResult.success) {
        throw new ExtensionError(
          uploadResult.error ?? 'Media upload failed',
          'MEDIA_UPLOAD_FAILED',
          true,
        );
      }
      log('Media uploaded successfully.');
    }

    // ---- Phase 7+8: Compose + Post (delegated to x-post-session) ----
    currentJob.phase = 'filling-composer';
    broadcast(currentJob);

    const sessionOutcome = await runXPostSession(
      xTab.id,
      postText,
      mode,
      !!videoDataUrl,
      {
        sendToTab,
        log,
        onPhaseChange: (phase) => {
          currentJob!.phase = phase;
          broadcast(currentJob!);
        },
      },
    );

    if (sessionOutcome.result === 'posted') {
      currentJob.phase = 'completed';
      log('Job completed.');
    } else {
      // awaiting-review
      currentJob.phase = 'awaiting-review';
    }
    broadcast(currentJob);
    appendJobHistory(currentJob);
    notifyQueueOnJobEnd(currentJob.jobId, 'completed');
  } catch (err) {
    currentJob.phase = 'failed';
    const message = err instanceof Error ? err.message : String(err);
    const errorCode = err instanceof ExtensionError ? err.code : 'UNKNOWN';
    currentJob.errorCode = errorCode;
    currentJob.error = ERROR_DESCRIPTIONS[errorCode] ?? message;
    log(`Error: ${message}`);
    broadcast(currentJob);
    appendJobHistory(currentJob);
    notifyQueueOnJobEnd(currentJob.jobId, 'failed', currentJob.error);
  }
}

export function cancelJob(): void {
  if (currentJob && currentJob.phase !== 'completed' && currentJob.phase !== 'failed') {
    currentJob.phase = 'failed';
    currentJob.errorCode = 'CANCELLED';
    currentJob.error = ERROR_DESCRIPTIONS.CANCELLED;
    log('Job cancelled.');
    broadcast(currentJob);
  }
}

// ---------------------------------------------------------------------------
// Video fetch helpers
// ---------------------------------------------------------------------------

async function fetchVideoAsDataUrl(
  videoUrl: string,
  tabId: number,
): Promise<string> {
  try {
    // Try background fetch first
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VIDEO_FETCH_TIMEOUT);
    const resp = await fetch(videoUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return blobToDataUrl(blob);
  } catch (error) {
    log(`Background download failed; trying tab fallback. ${error instanceof Error ? error.message : String(error)}`);
    // Fallback: ask content script to fetch from page context
    const tabResult = await fetchVideoViaTab(tabId, videoUrl);
    if (!tabResult) throw new Error('Tab fetch also failed');
    return tabResult;
  }
}

async function fetchVideoViaTab(
  tabId: number,
  videoUrl?: string,
): Promise<string | undefined> {
  try {
    const result = await sendToTab<{ success: boolean; dataUrl?: string }>(
      tabId,
      { action: 'FETCH_VIDEO_BLOB', videoUrl },
    );
    return result.success ? result.dataUrl : undefined;
  } catch {
    return undefined;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
