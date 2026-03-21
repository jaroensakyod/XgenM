import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

import { createChromeMock } from '../mocks/chrome';

Object.defineProperty(globalThis, 'chrome', {
  value: createChromeMock(),
  writable: true,
  configurable: true,
});

beforeEach(() => {
  Object.assign(globalThis.chrome, createChromeMock());
  vi.clearAllMocks();
});