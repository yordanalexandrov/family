import { generateKeyPairSync } from 'node:crypto';
import { HttpResponse, http } from 'msw';
import type { CalendarSourceConfig } from '../config.js';
import daniPage1 from './fixtures/google/events-page-1.json' with {
  type: 'json',
};
import daniPage2 from './fixtures/google/events-page-2.json' with {
  type: 'json',
};
import familyEvents from './fixtures/google/family-events.json' with {
  type: 'json',
};
import poliEvents from './fixtures/google/poli-events.json' with {
  type: 'json',
};
import { DANI, POLI } from './users.js';

/** The three calendar sources of the specs, as GOOGLE_CALENDARS would list them. */
export const DANI_CALENDAR: CalendarSourceConfig = {
  googleCalendarId: 'dani@example.com',
  name: 'Дани',
  ownerUserId: DANI.id,
  colorToken: 'person-1',
};
export const POLI_CALENDAR: CalendarSourceConfig = {
  googleCalendarId: 'poli@example.com',
  name: 'Поли',
  ownerUserId: POLI.id,
  colorToken: 'person-2',
};
export const FAMILY_CALENDAR: CalendarSourceConfig = {
  googleCalendarId: 'family@group.calendar.google.com',
  name: 'Семеен',
  ownerUserId: null,
  colorToken: 'family',
};
export const TEST_CALENDARS = [DANI_CALENDAR, POLI_CALENDAR, FAMILY_CALENDAR];

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

/** GOOGLE_SERVICE_ACCOUNT_JSON of the specs: a freshly generated key that only the mocked token endpoint accepts. */
export const TEST_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'family-test',
  client_email: 'calendar-reader@family-test.iam.gserviceaccount.com',
  private_key: privateKey,
});

const ACCESS_TOKEN = 'test-access-token';

/** One page of `events.list`, as Google answers it. */
export type EventsPage = { items?: unknown[]; nextPageToken?: string };

/** The fixtures: Dani's calendar comes in two pages, Poli has the invitation copy, the family a holiday. */
export const FIXTURE_PAGES: Record<string, EventsPage[]> = {
  [DANI_CALENDAR.googleCalendarId]: [daniPage1, daniPage2],
  [POLI_CALENDAR.googleCalendarId]: [poliEvents],
  [FAMILY_CALENDAR.googleCalendarId]: [familyEvents],
};

/** Google's error body for `status` with `reason` (e.g. `rateLimitExceeded`, `notFound`). */
export function googleError(status: number, reason: string) {
  return HttpResponse.json(
    { error: { code: status, message: reason, errors: [{ reason }] } },
    { status },
  );
}

/** The OAuth token endpoint the service account exchanges its signed JWT at. */
export const tokenHandler = http.post(
  'https://oauth2.googleapis.com/token',
  () =>
    HttpResponse.json({
      access_token: ACCESS_TOKEN,
      expires_in: 3600,
      token_type: 'Bearer',
    }),
);

const EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/:calendarId/events';

/**
 * `events.list` answering from `pages` by calendar id; `pageToken=page-N` is the N-th page.
 * A calendar missing from `pages` answers 404 like one not shared with the service account.
 */
export function eventsHandler(pages: Record<string, EventsPage[]>) {
  return http.get(EVENTS_URL, ({ request, params }) => {
    if (request.headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
      return googleError(401, 'authError');
    }
    const calendarPages = pages[String(params.calendarId)];
    if (!calendarPages) {
      return googleError(404, 'notFound');
    }
    const token = new URL(request.url).searchParams.get('pageToken');
    const page = calendarPages[token ? Number(token.slice(5)) - 1 : 0];
    return page ? HttpResponse.json(page) : googleError(400, 'badRequest');
  });
}

/**
 * Answers for one calendar ahead of `eventsHandler` (e.g. a 429 before the real page, or a 503 every time);
 * other calendars fall through to it. With `once`, only the first request of that calendar.
 */
export function eventsFor(
  calendarId: string,
  respond: () => Response | Promise<Response>,
  { once = false } = {},
) {
  let answered = false;
  return http.get(EVENTS_URL, ({ params }) => {
    if (params.calendarId !== calendarId || (once && answered)) {
      return undefined;
    }
    answered = true;
    return respond();
  });
}
