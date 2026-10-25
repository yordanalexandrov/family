import { calendarEventsResponseSchema } from '@family/shared';
import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { upsertCalendarSources } from '../db/repositories/calendar-sources.js';
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
import { DANI } from '../test/users.js';

/** Monday 2 November 2026, 10:00 in Sofia. */
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
  const sync = await app.inject({
    method: 'POST',
    url: '/api/sync/calendar',
    headers: { 'x-acting-user': DANI.id },
  });
  expect(sync.json()).toMatchObject({ status: 'ok' });
});

afterEach(() => server.resetHandlers());

afterAll(async () => {
  server.close();
  await app.close();
});

async function getEvents(query = '') {
  const response = await app.inject({
    method: 'GET',
    url: `/api/calendar/events${query}`,
  });
  return response;
}

function day(body: unknown, date: string) {
  const found = calendarEventsResponseSchema
    .parse(body)
    .days.find((entry) => entry.date === date);
  if (!found) {
    throw new Error(`no day ${date}`);
  }
  return found;
}

describe('GET /api/calendar/events', () => {
  it('answers 14 days from today without an acting user', async () => {
    const response = await getEvents();

    expect(response.statusCode).toBe(200);
    const body = calendarEventsResponseSchema.parse(response.json());
    expect(body.from).toBe('2026-11-02');
    expect(body.to).toBe('2026-11-16');
    expect(body.days.map((entry) => entry.date)).toHaveLength(14);
    expect(body.days[0]?.events.map((event) => event.title)).toEqual([
      'Зъболекар',
    ]);
    expect(body.days[0]?.events[0]).toMatchObject({
      start: '2026-11-02T15:00:00.000Z',
      end: '2026-11-02T16:00:00.000Z',
      allDay: false,
      location: 'ул. Шипка 1',
      sources: [
        expect.objectContaining({ name: 'Дани', colorToken: 'person-1' }),
      ],
    });
  });

  it('shows an invitation in two calendars as one event with both sources', async () => {
    const response = await getEvents();

    const dinners = day(response.json(), '2026-11-05').events;
    expect(dinners).toHaveLength(1);
    expect(dinners[0]?.title).toBe('Вечеря с приятели');
    expect(dinners[0]?.sources.map((source) => source.name).sort()).toEqual([
      'Дани',
      'Поли',
    ]);
  });

  it('puts an all-day event on its own Sofia day only', async () => {
    const response = await getEvents();

    const birthday = day(response.json(), '2026-11-03').events[0];
    expect(birthday).toMatchObject({
      title: 'Рожден ден на баба',
      allDay: true,
      start: '2026-11-02T22:00:00.000Z',
      end: '2026-11-03T22:00:00.000Z',
    });
    expect(
      day(response.json(), '2026-11-04').events.map((event) => event.title),
    ).toEqual(['Плуване']);
    expect(
      ['2026-11-07', '2026-11-08', '2026-11-09'].map(
        (date) => day(response.json(), date).events.length,
      ),
    ).toEqual([1, 1, 0]);
  });

  it('titles an event without details as busy', async () => {
    const response = await getEvents();

    expect(
      day(response.json(), '2026-11-06').events.map((event) => event.title),
    ).toEqual(['Заето']);
  });

  it('answers the asked days, the end exclusive', async () => {
    const response = await getEvents('?from=2026-11-05&to=2026-11-07');

    expect(response.statusCode).toBe(200);
    const body = calendarEventsResponseSchema.parse(response.json());
    expect(body.days.map((entry) => entry.date)).toEqual([
      '2026-11-05',
      '2026-11-06',
    ]);
  });

  it.each([
    ['more than 14 days', '?from=2026-11-02&to=2026-11-17'],
    ['an end before the start', '?from=2026-11-05&to=2026-11-05'],
    ['a date that is no date', '?from=2026-11-32'],
  ])('refuses %s with 400', async (_case, query) => {
    const response = await getEvents(query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'validation_error' });
  });

  it('answers empty days without Google Calendar config', async () => {
    const unconfigured = buildTestApp({ now: () => NOW });
    try {
      await testDb().$client.query('truncate calendar_event');
      const response = await unconfigured.inject({
        method: 'GET',
        url: '/api/calendar/events',
      });

      expect(response.statusCode).toBe(200);
      const body = calendarEventsResponseSchema.parse(response.json());
      expect(body.days).toHaveLength(14);
      expect(body.days.every((entry) => entry.events.length === 0)).toBe(true);
    } finally {
      await unconfigured.close();
    }
  });
});
