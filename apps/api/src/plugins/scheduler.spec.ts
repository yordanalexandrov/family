import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { upsertCalendarSources } from '../db/repositories/calendar-sources.js';
import { calendarEvent, syncRun } from '../db/schema/dashboard.js';
import { createCalendarClient } from '../integrations/google-calendar/client.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import {
  eventsHandler,
  FIXTURE_PAGES,
  TEST_CALENDARS,
  TEST_SERVICE_ACCOUNT_JSON,
  tokenHandler,
} from '../test/google.js';
import { server } from '../test/msw.js';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterAll(() => server.close());

describe('scheduler', () => {
  let app: FastifyInstance | undefined;

  afterAll(() => app?.close());

  it('syncs the calendar by itself once the app is ready', async () => {
    await upsertCalendarSources(testDb(), TEST_CALENDARS);
    server.use(tokenHandler, eventsHandler(FIXTURE_PAGES));
    app = buildTestApp({
      googleCalendar: createCalendarClient(TEST_SERVICE_ACCOUNT_JSON),
      now: () => new Date('2026-11-02T08:00:00Z'),
      scheduler: { firstRunDelayMs: 0 },
    });

    await app.ready();

    await vi.waitFor(async () => {
      expect(await testDb().select().from(syncRun)).toEqual([
        expect.objectContaining({ source: 'calendar', status: 'ok' }),
      ]);
    });
    expect(await testDb().select().from(calendarEvent)).toHaveLength(7);
  });
});
