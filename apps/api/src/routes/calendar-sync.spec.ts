import { syncRunResultSchema } from '@family/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { HttpResponse } from 'msw';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { upsertCalendarSources } from '../db/repositories/calendar-sources.js';
import {
  calendarEvent,
  calendarSource,
  syncRun,
} from '../db/schema/dashboard.js';
import { createCalendarClient } from '../integrations/google-calendar/client.js';
import { buildTestApp } from '../test/app.js';
import { testDb } from '../test/db.js';
import daniPage1 from '../test/fixtures/google/events-page-1.json' with {
  type: 'json',
};
import daniPage2 from '../test/fixtures/google/events-page-2.json' with {
  type: 'json',
};
import {
  DANI_CALENDAR,
  eventsFor,
  eventsHandler,
  FAMILY_CALENDAR,
  FIXTURE_PAGES,
  googleError,
  POLI_CALENDAR,
  TEST_CALENDARS,
  TEST_SERVICE_ACCOUNT_JSON,
  tokenHandler,
} from '../test/google.js';
import { server } from '../test/msw.js';
import { DANI } from '../test/users.js';

/** Monday 2 November 2026, 10:00 in Sofia: the window is 2–15 November. */
const NOW = new Date('2026-11-02T08:00:00Z');

let app: FastifyInstance;

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' });
  app = buildTestApp({
    googleCalendar: createCalendarClient(TEST_SERVICE_ACCOUNT_JSON, {
      sleep: async () => undefined,
    }),
    now: () => NOW,
  });
  await app.ready();
});

beforeEach(async () => {
  await upsertCalendarSources(testDb(), TEST_CALENDARS);
  server.use(tokenHandler, eventsHandler(FIXTURE_PAGES));
});

afterEach(() => server.resetHandlers());

afterAll(async () => {
  server.close();
  await app.close();
});

function syncNow() {
  return app.inject({
    method: 'POST',
    url: '/api/sync/calendar',
    headers: { 'x-acting-user': DANI.id },
  });
}

/** External ids of the cached events of a calendar, sorted. */
async function cachedEventIds(googleCalendarId: string) {
  const rows = await testDb()
    .select({ externalId: calendarEvent.externalId })
    .from(calendarEvent)
    .innerJoin(
      calendarSource,
      eq(calendarEvent.calendarSourceId, calendarSource.id),
    )
    .where(eq(calendarSource.googleCalendarId, googleCalendarId));
  return rows.map((row) => row.externalId).sort();
}

describe('POST /api/sync/calendar', () => {
  it('caches the events of every calendar, following pages and leaving out cancelled ones', async () => {
    const response = await syncNow();

    expect(response.statusCode).toBe(200);
    expect(syncRunResultSchema.parse(response.json())).toMatchObject({
      source: 'calendar',
      status: 'ok',
    });
    expect(await cachedEventIds(DANI_CALENDAR.googleCalendarId)).toEqual([
      'birthday',
      'busy',
      'dentist',
      'dinner-dani',
      'swim_20261104T160000Z',
    ]);
    expect(await cachedEventIds('poli@example.com')).toEqual(['dinner-poli']);
    expect(await cachedEventIds('family@group.calendar.google.com')).toEqual([
      'holiday',
    ]);
    const runs = await testDb().select().from(syncRun);
    expect(runs).toEqual([
      expect.objectContaining({
        source: 'calendar',
        status: 'ok',
        error: null,
      }),
    ]);
  });

  it('drops an event that is gone from Google on the next sync', async () => {
    await syncNow();
    server.use(
      eventsHandler({
        ...FIXTURE_PAGES,
        // The dentist appointment was deleted; only the second page is left.
        [DANI_CALENDAR.googleCalendarId]: [{ items: daniPage2.items }],
      }),
    );

    const response = await syncNow();

    expect(response.json()).toMatchObject({ status: 'ok' });
    expect(await cachedEventIds(DANI_CALENDAR.googleCalendarId)).toEqual([
      'busy',
      'dinner-dani',
    ]);
  });

  it('fails the run but syncs the other calendars when one is not shared with the service account', async () => {
    const { [POLI_CALENDAR.googleCalendarId]: _notShared, ...shared } =
      FIXTURE_PAGES;
    server.use(eventsHandler(shared));

    const response = await syncNow();

    expect(response.statusCode).toBe(200);
    const result = syncRunResultSchema.parse(response.json());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Поли');
    expect(result.error).toContain('calendar_not_shared');
    expect(result.error).toContain(POLI_CALENDAR.googleCalendarId);
    expect(result.error).not.toContain('Дани');
    expect(await cachedEventIds(DANI_CALENDAR.googleCalendarId)).toHaveLength(
      5,
    );
    expect(await cachedEventIds(FAMILY_CALENDAR.googleCalendarId)).toEqual([
      'holiday',
    ]);
    const [run] = await testDb().select().from(syncRun);
    expect(run).toMatchObject({ status: 'failed', error: result.error });
  });

  it('retries a calendar that is rate limited', async () => {
    let requests = 0;
    server.use(
      eventsFor(
        POLI_CALENDAR.googleCalendarId,
        () => {
          requests++;
          return googleError(429, 'rateLimitExceeded');
        },
        { once: true },
      ),
    );

    const response = await syncNow();

    expect(requests).toBe(1);
    expect(response.json()).toMatchObject({ status: 'ok' });
    expect(await cachedEventIds(POLI_CALENDAR.googleCalendarId)).toEqual([
      'dinner-poli',
    ]);
  });

  it('gives up on a calendar that keeps answering 5xx after four attempts', async () => {
    let requests = 0;
    server.use(
      eventsFor(FAMILY_CALENDAR.googleCalendarId, () => {
        requests++;
        return googleError(503, 'backendError');
      }),
    );

    const response = await syncNow();

    expect(requests).toBe(4);
    expect(response.json()).toMatchObject({ status: 'failed' });
    expect(await cachedEventIds(DANI_CALENDAR.googleCalendarId)).toHaveLength(
      5,
    );
  });

  it('answers 202 running without starting a second sync while one is under way', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      eventsFor(
        DANI_CALENDAR.googleCalendarId,
        async () => {
          await held;
          return HttpResponse.json(daniPage1);
        },
        { once: true },
      ),
    );

    const first = syncNow();
    // Let the first sync reach Google before the second request comes in.
    await vi.waitFor(async () => {
      expect(await testDb().select().from(syncRun)).toHaveLength(1);
    });
    const second = await syncNow();
    release();

    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual({ source: 'calendar', status: 'running' });
    expect((await first).json()).toMatchObject({ status: 'ok' });
    expect(await testDb().select().from(syncRun)).toHaveLength(1);
  });

  it('needs an acting user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sync/calendar',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'missing_acting_user' });
  });

  it('answers unconfigured without Google Calendar config', async () => {
    const unconfigured = buildTestApp();
    try {
      const response = await unconfigured.inject({
        method: 'POST',
        url: '/api/sync/calendar',
        headers: { 'x-acting-user': DANI.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        source: 'calendar',
        status: 'unconfigured',
      });
      expect(await testDb().select().from(syncRun)).toEqual([]);
    } finally {
      await unconfigured.close();
    }
  });
});
