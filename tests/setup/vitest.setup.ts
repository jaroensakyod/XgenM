import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { createChromeMock } from '../mocks/chrome';

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'chrome', {
  value: createChromeMock(),
  writable: true,
  configurable: true,
});

beforeEach(() => {
  Object.assign(globalThis.chrome, createChromeMock());
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});
