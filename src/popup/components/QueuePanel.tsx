// ---------------------------------------------------------------------------
// QueuePanel.tsx — Displays the scheduled job queue with status and cancel
// ---------------------------------------------------------------------------

import React from 'react';
import type { QueueEntry, QueueEntryStatus } from '@shared/schedule';

interface Props {
  entries: QueueEntry[];
  onCancel: (id: string) => void;
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
  cancelBtn: {
    padding: '3px 8px',
    fontSize: 11,
    background: 'transparent',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
    borderRadius: 5,
    cursor: 'pointer',
    flexShrink: 0,
  },
};

export function QueuePanel({ entries, onCancel }: Props) {
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
      <div style={styles.sectionTitle}>Queue ({entries.length})</div>
      {entries.map((entry) => (
        <div key={entry.id} style={styles.entry}>
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
                style={styles.cancelBtn}
                onClick={() => onCancel(entry.id)}
              >
                Cancel
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
