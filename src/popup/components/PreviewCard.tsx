import React from 'react';
import type { ExtractedSourceData } from '@shared/types';

interface Props {
  data: ExtractedSourceData;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const },
  value: { fontSize: 13, color: 'var(--text)', wordBreak: 'break-word' as const },
  tag: {
    display: 'inline-block',
    background: 'var(--bg)',
    color: 'var(--accent)',
    fontSize: 12,
    padding: '2px 6px',
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 2,
  },
  row: { display: 'flex', gap: 12 },
  badge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 10,
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
  },
};

export function PreviewCard({ data }: Props) {
  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <span style={styles.badge}>{data.platform.toUpperCase()}</span>
        <span style={styles.badge}>{data.extractionMethod}</span>
        {data.videoUrl && <span style={{ ...styles.badge, color: 'var(--success)', borderColor: 'var(--success)' }}>VIDEO ✓</span>}
      </div>

      {data.authorHandle && (
        <div>
          <span style={styles.label}>Author </span>
          <span style={styles.value}>
            @{data.authorHandle}
            {data.authorName ? ` (${data.authorName})` : ''}
          </span>
        </div>
      )}

      <div>
        <span style={styles.label}>Caption </span>
        <div style={styles.value}>
          {data.captionRaw.length > 120
            ? data.captionRaw.slice(0, 120) + '…'
            : data.captionRaw || '(empty)'}
        </div>
      </div>

      {data.hashtags.length > 0 && (
        <div>
          <span style={styles.label}>Hashtags </span>
          <div>
            {data.hashtags.map((tag) => (
              <span key={tag} style={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
