import React from 'react';

interface Props {
  isRunning: boolean;
  disabled: boolean;
  onStart: () => void;
  onCancel: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    width: '100%',
    padding: '10px 0',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
};

export function RunButton({ isRunning, disabled, onStart, onCancel }: Props) {
  if (isRunning) {
    return (
      <button
        onClick={onCancel}
        style={{
          ...styles.button,
          background: 'var(--danger)',
          color: '#fff',
        }}
      >
        ✕ Cancel
      </button>
    );
  }

  return (
    <button
      onClick={onStart}
      disabled={disabled}
      style={{
        ...styles.button,
        background: disabled ? 'var(--border)' : 'var(--accent)',
        color: disabled ? 'var(--text-muted)' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      ▶ Start Cross Post
    </button>
  );
}
