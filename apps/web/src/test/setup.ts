import '@testing-library/jest-dom/vitest';
// IndexedDB в jsdom: офлайн кешът и опашката на списъка за пазаруване (idb-keyval).
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { clear } from 'idb-keyval';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(async () => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  await clear();
});

afterAll(() => server.close());
