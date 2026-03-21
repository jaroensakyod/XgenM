import React, { useEffect, useRef } from 'react';

interface Props {
  logs: string[];
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 8,
    maxHeight: 160,
    overflowY: 'auto' as const,
  },
  label: {
    fontSize: 11,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
    display: 'block',
  },
  line: {
    fontSize: 11,
    color: 'var(--text)',
    fontFamily: 'monospace',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
};

export function LogPanel({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div style={styles.wrapper}>
      <span style={styles.label}>Log</span>
      {logs.map((line, i) => (
        <div key={i} style={styles.line}>
          {line}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
