import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@popup/App';
import { DEFAULT_SETTINGS, type JobState } from '@shared/types';

import type { ChromeMock } from '../../mocks/chrome';

function getChromeMock(): ChromeMock {
  return globalThis.chrome as ChromeMock;
}

function createJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    jobId: 'job-1',
    mode: 'prepare-draft',
    sourceUrl: 'https://www.tiktok.com/@oracle/video/1234567890',
    platform: 'tiktok',
    phase: 'awaiting-review',
    logs: [],
    ...overrides,
  };
}

describe('popup App', () => {
  it('keeps the start button disabled when no source URL exists', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /start cross post/i })).toBeDisabled();
  });

  it('auto-populates the source URL from a supported active tab and can start a job', async () => {
    const chromeMock = getChromeMock();
    chromeMock.__mock.setTabsQueryResult([
      { url: 'https://www.tiktok.com/@oracle/video/1234567890' },
    ]);

    render(<App />);

    const startButton = screen.getByRole('button', { name: /start cross post/i });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://www.tiktok.com/@user/video/...')).toHaveValue(
        'https://www.tiktok.com/@oracle/video/1234567890',
      );
      expect(startButton).toBeEnabled();
    });

    fireEvent.click(startButton);

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'START_JOB',
      sourceUrl: 'https://www.tiktok.com/@oracle/video/1234567890',
      mode: 'prepare-draft',
      captionOverride: undefined,
    });
  });

  it('renders recovered job state and reacts to runtime job updates', async () => {
    const chromeMock = getChromeMock();
    chromeMock.__mock.setJobStateResponse(createJobState({
      updatedAt: '2026-03-25T09:00:00.000Z',
      logs: ['Recovered job state'],
    }));
    chromeMock.__mock.setJobStateSource('persisted');
    chromeMock.__mock.setHistoryResponse([
      createJobState({
        updatedAt: '2026-03-25T09:00:00.000Z',
        logs: ['Recovered job state'],
      }),
    ]);

    render(<App />);

    expect(await screen.findAllByText('AWAITING REVIEW')).toHaveLength(2);
    expect(screen.getByText('Recovered job state')).toBeInTheDocument();
    expect(screen.getByText(/recovered snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/recent jobs/i)).toBeInTheDocument();

    act(() => {
      chromeMock.__mock.dispatchRuntimeMessage({
        action: 'JOB_STATE_UPDATE',
        state: createJobState({
          phase: 'completed',
          logs: ['Recovered job state', 'Completed'],
        }),
      });
    });

    expect(await screen.findAllByText('COMPLETED')).toHaveLength(1);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('hydrates settings and saves updated settings back to the background', async () => {
    const chromeMock = getChromeMock();
    chromeMock.__mock.setSettingsResponse({
      ...DEFAULT_SETTINGS,
      defaultMode: 'auto-post',
      maxHashtags: 3,
      captionTemplate: '{caption}\n\n{hashtags}',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/default mode/i)).toHaveValue('auto-post');
    });

    fireEvent.change(screen.getByLabelText(/max hashtags/i), {
      target: { value: '99' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByText('Settings saved')).toBeInTheDocument();
    });

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      {
        action: 'SAVE_SETTINGS',
        settings: {
          defaultMode: 'auto-post',
          includeSourceCredit: true,
          maxHashtags: 10,
          captionTemplate: '{caption}\n\n{hashtags}',
        },
      },
      expect.any(Function),
    );
  });
});
