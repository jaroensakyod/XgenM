import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@popup/App';
import type { JobState } from '@shared/types';

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
      logs: ['Recovered job state'],
    }));

    render(<App />);

    expect(await screen.findByText('AWAITING REVIEW')).toBeInTheDocument();
    expect(screen.getByText('Recovered job state')).toBeInTheDocument();

    act(() => {
      chromeMock.__mock.dispatchRuntimeMessage({
        action: 'JOB_STATE_UPDATE',
        state: createJobState({
          phase: 'completed',
          logs: ['Recovered job state', 'Completed'],
        }),
      });
    });

    expect(await screen.findByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });
});
