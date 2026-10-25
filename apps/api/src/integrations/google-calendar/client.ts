import { JWT } from 'google-auth-library';
import { z } from 'zod';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const BASE_URL = 'https://www.googleapis.com/calendar/v3';
const REQUEST_TIMEOUT_MS = 20_000;
/** Attempts per page, the first one included. */
const MAX_ATTEMPTS = 4;
const MAX_BACKOFF_MS = 32_000;

/** `start`, `end` or `originalStartTime` of an event: `date` for all-day events, `dateTime` (with offset) otherwise. */
export interface GoogleEventTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

/** The fields of Google's Event resource the dashboard reads. */
export interface GoogleEvent {
  id: string;
  iCalUID?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  /** Missing for a private event: the service account sees only that the time is taken. */
  summary?: string;
  location?: string;
  htmlLink?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  recurringEventId?: string;
  originalStartTime?: GoogleEventTime;
}

interface EventsPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

/** Reads the events of one calendar between two instants; cancelled events are left out. */
export type ListEvents = (
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  timeZone: string,
) => Promise<GoogleEvent[]>;

export interface GoogleCalendarClient {
  listEvents: ListEvents;
}

/** The calendar answered 404: it is not shared with the service account (or the id is wrong). Not retried. */
export class CalendarNotSharedError extends Error {
  readonly code = 'calendar_not_shared';
  readonly calendarId: string;

  constructor(calendarId: string) {
    super(`calendar_not_shared: ${calendarId}`);
    this.name = 'CalendarNotSharedError';
    this.calendarId = calendarId;
  }
}

const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

/** The key's e-mail and private key; errors never quote the input, which is a secret. */
function parseServiceAccount(json: string) {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  const result = serviceAccountSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON has no client_email or private_key',
    );
  }
  return result.data;
}

export interface CalendarClientOptions {
  /** Waits between attempts; specs pass one that does not wait. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What gaxios puts on a failed request: the HTTP status and Google's error body. */
interface HttpFailure {
  status?: number;
  response?: { status?: number; data?: unknown };
}

function statusOf(error: unknown): number | undefined {
  const failure = error as HttpFailure | null;
  return failure?.status ?? failure?.response?.status;
}

/** Google's `error.errors[].reason` values of a failed request. */
function reasonsOf(error: unknown): string[] {
  const data = (error as HttpFailure | null)?.response?.data as
    | { error?: { errors?: { reason?: string }[] } }
    | undefined;
  return (data?.error?.errors ?? []).flatMap((item) =>
    item.reason ? [item.reason] : [],
  );
}

/** Rate limits (403 `rateLimitExceeded`/`userRateLimitExceeded`, 429) and server errors are worth another try. */
function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  return (
    status === 403 &&
    reasonsOf(error).some(
      (reason) =>
        reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded',
    )
  );
}

/** Truncated exponential backoff as Google recommends: 2^n s plus up to 1 s of jitter, at most 32 s. */
function backoffMs(retry: number): number {
  return Math.min(2 ** retry * 1000 + Math.random() * 1000, MAX_BACKOFF_MS);
}

/**
 * Google Calendar read through the service account of `serviceAccountJson` (GOOGLE_SERVICE_ACCOUNT_JSON).
 * Plain REST over the auth client's `fetch`, which gets and refreshes the access token.
 */
export function createCalendarClient(
  serviceAccountJson: string,
  { sleep = wait }: CalendarClientOptions = {},
): GoogleCalendarClient {
  const keys = parseServiceAccount(serviceAccountJson);
  const auth = new JWT({
    email: keys.client_email,
    key: keys.private_key,
    scopes: [SCOPE],
  });

  async function fetchPage(calendarId: string, url: string) {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await auth.fetch<EventsPage>({
          url,
          timeout: REQUEST_TIMEOUT_MS,
        });
        return response.data;
      } catch (error) {
        if (statusOf(error) === 404) {
          throw new CalendarNotSharedError(calendarId);
        }
        if (attempt >= MAX_ATTEMPTS || !isRetryable(error)) {
          throw error;
        }
        await sleep(backoffMs(attempt - 1));
      }
    }
  }

  async function listEvents(
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
    timeZone: string,
  ): Promise<GoogleEvent[]> {
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        timeZone,
        maxResults: '250',
      });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }
      const page = await fetchPage(
        calendarId,
        `${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      );
      events.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return events.filter((event) => event.status !== 'cancelled');
  }

  return { listEvents };
}
