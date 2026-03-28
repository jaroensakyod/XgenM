// ---------------------------------------------------------------------------
// QueuePanel.tsx — Displays the scheduled job queue with status and cancel
// ---------------------------------------------------------------------------

import React from 'react';
import type { QueueEntry, QueueEntryStatus } from '@shared/schedule';

interface Props {
  entries: QueueEntry[];
  onCancelEntry: (id: string) => void;
  onClearFinished: () => void;
}

function statusLabel(status: QueueEntryStatus): string {
  switch (status) {
    case 'pending':   return 'Pending';
    case 'running':   return 'Running';
    case 'completed': return 'Done';
    case 'failed':    return 'Failed';
    case 'cancelled': return 'Cancelled';
  }
}

function statusColor(status: QueueEntryStatus): string {
  switch (status) {
    case 'pending':   return 'var(--text-muted)';
    case 'running':   return 'var(--warning)';
    case 'completed': return 'var(--success)';
    case 'failed':    return 'var(--danger)';
    case 'cancelled': return 'var(--text-muted)';
  }
}

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.slice(0, 30);
    return u.hostname + (path.length < u.pathname.length ? path + '…' : path);
  } catch {
    return url.slice(0, 40);
  }
}

const styles: Record<string, React.CSSProperties> = {
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
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  entry: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.02)',
  },
  actionBtn: {
    padding: '3px 8px',
    fontSize: 11,
    background: 'transparent',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
    borderRadius: 5,
    cursor: 'pointer',
    flexShrink: 0,
  },
  clearBtn: {
    padding: '3px 8px',
    fontSize: 11,
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    cursor: 'pointer',
    flexShrink: 0,
  },
};

const FINISHED_STATUSES: QueueEntryStatus[] = ['completed', 'failed', 'cancelled'];

export function QueuePanel({ entries, onCancelEntry, onClearFinished }: Props) {
  const hasFinished = entries.some((e) => FINISHED_STATUSES.includes(e.status));

  if (entries.length === 0) {
    return (
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Queue</div>
        <div style={styles.helperText}>No scheduled jobs.</div>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <div style={styles.row}>
        <span style={styles.sectionTitle}>Queue ({entries.length})</span>
        {hasFinished && (
          <button
            type="button"
            style={styles.clearBtn}
            onClick={onClearFinished}
          >
            Clear Finished
          </button>
        )}
      </div>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            ...styles.entry,
            opacity: FINISHED_STATUSES.includes(entry.status) ? 0.6 : 1,
          }}
        >
          <div style={styles.row}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: statusColor(entry.status),
              }}
            >
              {statusLabel(entry.status)}
            </span>
            <span style={styles.helperText}>{formatScheduled(entry.scheduledAt)}</span>
            {entry.status === 'pending' && (
              <button
                type="button"
                style={styles.actionBtn}
                onClick={() => onCancelEntry(entry.id)}
              >
                Cancel
              </button>
            )}
            {entry.status === 'running' && (
              <button
                type="button"
                style={styles.actionBtn}
                onClick={() => onCancelEntry(entry.id)}
              >
                Stop
              </button>
            )}
          </div>
          <div style={{ ...styles.helperText, fontSize: 11 }}>
            {shortUrl(entry.sourceUrl)} — {entry.mode === 'auto-post' ? 'Auto-post' : 'Draft'}
          </div>
          {entry.failureReason && (
            <div style={{ fontSize: 11, color: 'var(--danger)' }}>{entry.failureReason}</div>
          )}
        </div>
      ))}
    </div>
  );
}

