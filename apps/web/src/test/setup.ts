import '@testing-library/jest-dom/vitest';
// IndexedDB в jsdom: офлайн кешът и опашката на списъка за пазаруване (idb-keyval).
import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { clear } from 'idb-keyval';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw';

// Под натоварване (няколко worktree-а пускат тестове едновременно) 1 s по подразбиране за findBy/waitFor не стига.
configure({ asyncUtilTimeout: 3000 });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(async () => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  await clear();
});

afterAll(() => server.close());
