import React, { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  USER_SETTINGS_LIMITS,
  normalizeUserSettings,
  type JobPhase,
  type JobState,
  type RunMode,
  type UserSettings,
} from '@shared/types';
import { ERROR_RECOVERY_HINTS } from '@shared/errors';
import type { JobStateUpdateMessage, QueueUpdateMessage, RuntimeMessage } from '@shared/messages';
import type { QueueEntry } from '@shared/schedule';
import { UrlInput } from './components/UrlInput';
import { PreviewCard } from './components/PreviewCard';
import { ModeToggle } from './components/ModeToggle';
import { RunButton } from './components/RunButton';
import { LogPanel } from './components/LogPanel';
import { QueuePanel } from './components/QueuePanel';

type JobStateSource = 'live' | 'persisted' | 'none';

function isRunningPhase(phase: JobPhase): boolean {
  return phase !== 'idle' && phase !== 'completed' && phase !== 'failed';
}

function formatTimestamp(iso?: string): string {
  if (!iso) return 'Unknown time';

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Unknown time';

  return parsed.toLocaleString();
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--accent)',
  },
  version: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  status: {
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 6,
    textAlign: 'center' as const,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text)',
  },
  helperText: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  errorText: {
    fontSize: 12,
    color: 'var(--danger)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  input: {
    width: '100%',
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  smallInput: {
    width: 88,
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  button: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  historyItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.02)',
  },
};

export function App() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<RunMode>(DEFAULT_SETTINGS.defaultMode);
  const [captionOverride, setCaptionOverride] = useState('');
  const [job, setJob] = useState<JobState | null>(null);
  const [jobSource, setJobSource] = useState<JobStateSource>('none');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsStatus, setSettingsStatus] = useState('');
  const [history, setHistory] = useState<JobState[]>([]);

  // Queue state
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [queueFormOpen, setQueueFormOpen] = useState(false);
  const [queueUrl, setQueueUrl] = useState('');
  const [queueMode, setQueueMode] = useState<RunMode>(DEFAULT_SETTINGS.defaultMode);
  const [queueScheduledAt, setQueueScheduledAt] = useState('');
  const [queueFormError, setQueueFormError] = useState('');

  // Listen for job state broadcasts
  useEffect(() => {
    const listener = (message: RuntimeMessage) => {
      if (message.action === 'JOB_STATE_UPDATE') {
        setJob((message as JobStateUpdateMessage).state);
        setJobSource('live');
      }
      if (message.action === 'QUEUE_UPDATE') {
        setQueue((message as QueueUpdateMessage).entries);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage(
      { action: 'GET_SETTINGS' },
      (resp: { settings?: UserSettings | null }) => {
        const nextSettings = normalizeUserSettings(resp?.settings ?? DEFAULT_SETTINGS);
        setSettings(nextSettings);
        setSettingsDraft(nextSettings);
        setMode(nextSettings.defaultMode);
      },
    );

    chrome.runtime.sendMessage(
      { action: 'GET_JOB_STATE' },
      (resp: { state: JobState | null; source?: JobStateSource }) => {
        if (resp?.state) {
          setJob(resp.state);
          setJobSource(resp.source ?? 'persisted');
        }
      },
    );

    chrome.runtime.sendMessage(
      { action: 'GET_JOB_HISTORY' },
      (resp: { history?: JobState[] }) => {
        setHistory(resp?.history ?? []);
      },
    );

    chrome.runtime.sendMessage(
      { action: 'GET_QUEUE' },
      (resp: { entries?: QueueEntry[] }) => {
        setQueue(resp?.entries ?? []);
      },
    );

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Try to auto-detect URL from current tab
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs[0]?.url ?? '';
      if (
        tabUrl.includes('tiktok.com') ||
        tabUrl.includes('facebook.com/reel')
      ) {
        setUrl(tabUrl);
      }
    });
  }, []);

  const handleStart = useCallback(() => {
    setJobSource('live');
    chrome.runtime.sendMessage({
      action: 'START_JOB',
      sourceUrl: url,
      mode,
      captionOverride: captionOverride.trim() || undefined,
    });
  }, [url, mode, captionOverride]);

  const handleCancel = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'CANCEL_JOB' });
  }, []);

  const handleSaveSettings = useCallback(() => {
    const nextSettings = normalizeUserSettings(settingsDraft);
    setSettingsStatus('Saving settings…');
    chrome.runtime.sendMessage(
      {
        action: 'SAVE_SETTINGS',
        settings: nextSettings,
      },
      (resp: { settings?: UserSettings | null; error?: string }) => {
        if (!resp?.settings) {
          setSettingsStatus(resp?.error ?? 'Failed to save settings');
          return;
        }

        setSettings(resp.settings);
        setSettingsDraft(resp.settings);
        setMode(resp.settings.defaultMode);
        setSettingsStatus('Settings saved');
      },
    );
  }, [settingsDraft]);

  const handleAddToQueue = useCallback(() => {
    if (!queueUrl.trim() || !queueScheduledAt) {
      setQueueFormError('URL and scheduled time are required.');
      return;
    }
    setQueueFormError('');
    const scheduledAt = new Date(queueScheduledAt).toISOString();
    chrome.runtime.sendMessage(
      {
        action: 'ADD_TO_QUEUE',
        entry: { kind: 'cross-post', sourceUrl: queueUrl.trim(), mode: queueMode, scheduledAt },
      },
      (resp: { entry?: QueueEntry | null; error?: string }) => {
        if (!resp?.entry) {
          setQueueFormError(resp?.error ?? 'Failed to add to queue.');
          return;
        }
        setQueueFormOpen(false);
        setQueueUrl('');
        setQueueScheduledAt('');
      },
    );
  }, [queueUrl, queueMode, queueScheduledAt]);

  const handleCancelQueueEntry = useCallback((id: string) => {
    chrome.runtime.sendMessage({ action: 'CANCEL_QUEUE_ENTRY', id });
  }, []);

  const handleClearFinished = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'CLEAR_FINISHED_QUEUE' });
  }, []);

  const isRunning =
    job !== null &&
    jobSource === 'live' &&
    isRunningPhase(job.phase);

  const isRestoredSnapshot = job !== null && jobSource === 'persisted';

  const statusColor =
    job?.phase === 'completed'
      ? 'var(--success)'
      : job?.phase === 'failed'
        ? 'var(--danger)'
        : isRunning
          ? 'var(--warning)'
          : 'var(--text-muted)';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Cross Post to X</span>
        <span style={styles.version}>v0.1.0</span>
      </div>

      {/* URL Input */}
      <UrlInput value={url} onChange={setUrl} disabled={isRunning} />

      {/* Mode Toggle */}
      <ModeToggle value={mode} onChange={setMode} disabled={isRunning} />

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Settings</div>
        <div style={styles.row}>
          <label htmlFor="default-mode" style={styles.helperText}>Default mode</label>
          <select
            id="default-mode"
            value={settingsDraft.defaultMode}
            onChange={(e) => {
              const nextMode = e.target.value as RunMode;
              setSettingsDraft((current) => ({ ...current, defaultMode: nextMode }));
              if (!isRunning) {
                setMode(nextMode);
              }
            }}
            style={styles.smallInput}
          >
            <option value="prepare-draft">Draft</option>
            <option value="auto-post">Auto-post</option>
          </select>
        </div>

        <label style={styles.row}>
          <span style={styles.helperText}>Include source credit</span>
          <input
            type="checkbox"
            checked={settingsDraft.includeSourceCredit}
            onChange={(e) => {
              setSettingsDraft((current) => ({ ...current, includeSourceCredit: e.target.checked }));
            }}
          />
        </label>

        <div style={styles.row}>
          <label htmlFor="max-hashtags" style={styles.helperText}>Max hashtags</label>
          <input
            id="max-hashtags"
            type="number"
            min={USER_SETTINGS_LIMITS.minHashtags}
            max={USER_SETTINGS_LIMITS.maxHashtags}
            value={settingsDraft.maxHashtags}
            onChange={(e) => {
              const nextValue = Number(e.target.value);
              setSettingsDraft((current) => ({
                ...current,
                maxHashtags: Number.isFinite(nextValue)
                  ? Math.min(USER_SETTINGS_LIMITS.maxHashtags, Math.max(USER_SETTINGS_LIMITS.minHashtags, nextValue))
                  : USER_SETTINGS_LIMITS.minHashtags,
              }));
            }}
            style={styles.smallInput}
          />
        </div>

        <div>
          <label htmlFor="caption-template" style={{ ...styles.helperText, display: 'block', marginBottom: 4 }}>
            Caption template
          </label>
          <textarea
            id="caption-template"
            value={settingsDraft.captionTemplate}
            onChange={(e) => {
              setSettingsDraft((current) => ({ ...current, captionTemplate: e.target.value }));
            }}
            rows={4}
            style={{ ...styles.input, resize: 'vertical' }}
          />
          <div style={styles.helperText}>Use placeholders: {'{caption}'}, {'{hashtags}'}, {'{source}'}</div>
        </div>

        <div style={styles.row}>
          <button type="button" style={styles.button} onClick={handleSaveSettings}>
            Save settings
          </button>
          <span style={styles.helperText}>{settingsStatus || `Current mode: ${settings.defaultMode}`}</span>
        </div>
      </div>

      {/* Caption Override */}
      <div>
        <label
          style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}
        >
          Caption override (optional)
        </label>
        <textarea
          value={captionOverride}
          onChange={(e) => setCaptionOverride(e.target.value)}
          disabled={isRunning}
          placeholder="Leave blank to use extracted caption…"
          rows={3}
          style={{
            width: '100%',
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 13,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Preview */}
      {job?.extraction && <PreviewCard data={job.extraction} />}

      {/* Status badge */}
      {job && (
        <>
          <div
            style={{
              ...styles.status,
              color: statusColor,
              border: `1px solid ${statusColor}`,
            }}
          >
            {job.phase.replace(/-/g, ' ').toUpperCase()}
            {job.error ? ` — ${job.error}` : ''}
          </div>

          {isRestoredSnapshot && (
            <div style={{ ...styles.section, gap: 4 }}>
              <div style={styles.sectionTitle}>Recovered snapshot</div>
              <div style={styles.helperText}>
                This state was restored from local storage and is shown as historical context, not an active background run.
              </div>
              <div style={styles.helperText}>Last update: {formatTimestamp(job.updatedAt)}</div>
            </div>
          )}

          {job.error && (
            <div style={{ ...styles.section, gap: 4 }}>
              <div style={styles.sectionTitle}>Recovery hint</div>
              <div style={styles.errorText}>{job.error}</div>
              <div style={styles.helperText}>
                {job.errorCode ? ERROR_RECOVERY_HINTS[job.errorCode] : 'Check the runtime log for the failing layer and retry.'}
              </div>
            </div>
          )}
        </>
      )}

      {/* Run / Cancel */}
      <RunButton
        isRunning={isRunning}
        disabled={!url.trim()}
        onStart={handleStart}
        onCancel={handleCancel}
      />

      {/* Scheduled Queue */}
      <div style={styles.section}>
        <div style={{ ...styles.row, alignItems: 'center' }}>
          <span style={styles.sectionTitle}>Schedule a Job</span>
          <button
            type="button"
            style={{
              ...styles.button,
              padding: '4px 10px',
              fontSize: 12,
            }}
            onClick={() => {
              setQueueFormOpen((open) => !open);
              setQueueFormError('');
            }}
          >
            {queueFormOpen ? 'Close' : '+ Add'}
          </button>
        </div>

        {queueFormOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <UrlInput value={queueUrl} onChange={setQueueUrl} disabled={false} />
            <div style={styles.row}>
              <label htmlFor="queue-mode" style={styles.helperText}>Mode</label>
              <select
                id="queue-mode"
                value={queueMode}
                onChange={(e) => setQueueMode(e.target.value as RunMode)}
                style={styles.smallInput}
              >
                <option value="prepare-draft">Draft</option>
                <option value="auto-post">Auto-post</option>
              </select>
            </div>
            <div>
              <label htmlFor="queue-schedule" style={{ ...styles.helperText, display: 'block', marginBottom: 4 }}>
                Scheduled time
              </label>
              <input
                id="queue-schedule"
                type="datetime-local"
                value={queueScheduledAt}
                onChange={(e) => setQueueScheduledAt(e.target.value)}
                style={styles.input}
              />
            </div>
            {queueFormError && (
              <div style={styles.errorText}>{queueFormError}</div>
            )}
            <button
              type="button"
              style={styles.button}
              disabled={!queueUrl.trim() || !queueScheduledAt}
              onClick={handleAddToQueue}
            >
              Add to Queue
            </button>
          </div>
        )}
      </div>

      <QueuePanel entries={queue} onCancelEntry={handleCancelQueueEntry} onClearFinished={handleClearFinished} />

      {/* Logs */}
      {job && job.logs.length > 0 && <LogPanel logs={job.logs} />}

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Recent jobs</div>
        {history.length === 0 ? (
          <div style={styles.helperText}>No saved job history yet.</div>
        ) : (
          history.slice(0, 5).map((entry) => (
            <div key={`${entry.jobId}-${entry.updatedAt ?? ''}`} style={styles.historyItem}>
              <div style={{ ...styles.row, alignItems: 'flex-start' }}>
                <strong style={{ fontSize: 12 }}>{entry.phase.replace(/-/g, ' ').toUpperCase()}</strong>
                <span style={styles.helperText}>{formatTimestamp(entry.updatedAt ?? entry.createdAt)}</span>
              </div>
              <div style={styles.helperText}>{entry.sourceUrl}</div>
              {entry.error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{entry.error}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
