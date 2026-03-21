import React from 'react';
import type { RunMode } from '@shared/types';

interface Props {
  value: RunMode;
  onChange: (mode: RunMode) => void;
  disabled: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', gap: 8 },
  button: {
    flex: 1,
    padding: '8px 0',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
};

export function ModeToggle({ value, onChange, disabled }: Props) {
  const modes: { key: RunMode; label: string }[] = [
    { key: 'prepare-draft', label: '📝 Prepare Draft' },
    { key: 'auto-post', label: '⚡ Auto Post' },
  ];

  return (
    <div style={styles.wrapper}>
      {modes.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            disabled={disabled}
            style={{
              ...styles.button,
              background: active ? 'var(--accent)' : 'var(--surface)',
              color: active ? '#fff' : 'var(--text-muted)',
              borderColor: active ? 'var(--accent)' : 'var(--border)',
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
