import React, { useCallback, useEffect, useState } from 'react';
import type { JobState, RunMode } from '@shared/types';
import type { JobStateUpdateMessage, RuntimeMessage } from '@shared/messages';
import { UrlInput } from './components/UrlInput';
import { PreviewCard } from './components/PreviewCard';
import { ModeToggle } from './components/ModeToggle';
import { RunButton } from './components/RunButton';
import { LogPanel } from './components/LogPanel';

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
};

export function App() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<RunMode>('prepare-draft');
  const [captionOverride, setCaptionOverride] = useState('');
  const [job, setJob] = useState<JobState | null>(null);

  // Listen for job state broadcasts
  useEffect(() => {
    const listener = (message: RuntimeMessage) => {
      if (message.action === 'JOB_STATE_UPDATE') {
        setJob((message as JobStateUpdateMessage).state);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Recover last job state on popup open
    chrome.runtime.sendMessage(
      { action: 'GET_JOB_STATE' },
      (resp: { state: JobState | null }) => {
        if (resp?.state) setJob(resp.state);
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

  const isRunning =
    job !== null &&
    job.phase !== 'idle' &&
    job.phase !== 'completed' &&
    job.phase !== 'failed';

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
      )}

      {/* Run / Cancel */}
      <RunButton
        isRunning={isRunning}
        disabled={!url.trim()}
        onStart={handleStart}
        onCancel={handleCancel}
      />

      {/* Logs */}
      {job && job.logs.length > 0 && <LogPanel logs={job.logs} />}
    </div>
  );
}
