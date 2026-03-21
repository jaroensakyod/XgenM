import React from 'react';
import { isSupportedUrl } from '@shared/url';

interface Props {
  value: string;
  onChange: (url: string) => void;
  disabled: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, color: 'var(--text-muted)' },
  inputRow: { display: 'flex', gap: 6 },
  input: {
    flex: 1,
    padding: '8px 10px',
    fontSize: 13,
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    outline: 'none',
    fontFamily: 'inherit',
  },
  tabBtn: {
    padding: '8px 12px',
    fontSize: 12,
    background: 'var(--surface)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 6,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  hint: { fontSize: 11 },
};

export function UrlInput({ value, onChange, disabled }: Props) {
  const valid = value.trim() === '' || isSupportedUrl(value);

  const handleUseTab = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs[0]?.url ?? '';
      onChange(tabUrl);
    });
  };

  return (
    <div style={styles.wrapper}>
      <label style={styles.label}>Source URL (TikTok or Facebook Reel)</label>
      <div style={styles.inputRow}>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="https://www.tiktok.com/@user/video/..."
          style={{
            ...styles.input,
            borderColor: valid ? 'var(--border)' : 'var(--danger)',
          }}
        />
        <button
          onClick={handleUseTab}
          disabled={disabled}
          style={{
            ...styles.tabBtn,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Use Tab
        </button>
      </div>
      {!valid && (
        <span style={{ ...styles.hint, color: 'var(--danger)' }}>
          Not a supported TikTok or Facebook Reel URL
        </span>
      )}
    </div>
  );
}
