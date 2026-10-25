import {
  addDays,
  CALENDAR_MAX_DAYS,
  dateKeyInSofia,
  FAMILY_TIME_ZONE,
  type SyncRunResult,
  startOfDayInSofia,
} from '@family/shared';
import type { Db } from '../db/client.js';
import {
  type NewCalendarEvent,
  replaceSourceEvents,
  type TimeWindow,
} from '../db/repositories/calendar-events.js';
import {
  type EnabledCalendarSource,
  listEnabledSources,
} from '../db/repositories/calendar-sources.js';
import type {
  GoogleEvent,
  GoogleEventTime,
  ListEvents,
} from '../integrations/google-calendar/client.js';
import { oneAtATime, type Sync } from './sync-mutex.js';
import { messageOf, recordRun } from './sync-run.js';

/** Title of an event the service account may not see the details of (a private one). */
const BUSY_TITLE = 'Заето';

/** What the sync keeps in the cache: from 00:00 Sofia today to 00:00 Sofia `CALENDAR_MAX_DAYS` days later. */
export function syncWindow(now: Date): TimeWindow {
  const today = dateKeyInSofia(now);
  return {
    from: startOfDayInSofia(today),
    to: startOfDayInSofia(addDays(today, CALENDAR_MAX_DAYS)),
  };
}

/** An all-day `date` is 00:00 Sofia of that day (for `end` Google's date is already exclusive). */
function instantOf(time: GoogleEventTime): Date {
  if (time.dateTime) {
    return new Date(time.dateTime);
  }
  if (time.date) {
    return startOfDayInSofia(time.date);
  }
  throw new Error('event time has neither date nor dateTime');
}

/** The cached row of a Google event of `source`. */
export function toCalendarEventRow(
  source: EnabledCalendarSource,
  event: GoogleEvent,
  syncedAt: Date,
): NewCalendarEvent {
  return {
    calendarSourceId: source.id,
    externalId: event.id,
    icalUid: event.iCalUID ?? null,
    originalStart: event.originalStartTime
      ? instantOf(event.originalStartTime)
      : null,
    title: event.summary ?? BUSY_TITLE,
    start: instantOf(event.start),
    end: instantOf(event.end),
    allDay: Boolean(event.start.date),
    location: event.location ?? null,
    htmlLink: event.htmlLink ?? null,
    syncedAt,
  };
}

export interface SyncCalendarsDeps {
  sources: EnabledCalendarSource[];
  listEvents: ListEvents;
  now: () => Date;
  db: Db;
}

/**
 * GLOSSARY: Синхронизация. Reloads the window of every source, recorded as one `sync_run`. A source that fails
 * keeps its previous events and the others still sync; the run is then `failed` and its `error` names each
 * failed source.
 */
export function syncCalendars({
  sources,
  listEvents,
  now,
  db,
}: SyncCalendarsDeps): Promise<SyncRunResult> {
  return recordRun(db, 'calendar', now, async (startedAt) => {
    const window = syncWindow(startedAt);
    const failures: string[] = [];
    for (const source of sources) {
      try {
        const events = await listEvents(
          source.googleCalendarId,
          window.from,
          window.to,
          FAMILY_TIME_ZONE,
        );
        const syncedAt = now();
        await replaceSourceEvents(
          db,
          source.id,
          window,
          events.map((event) => toCalendarEventRow(source, event, syncedAt)),
        );
      } catch (error) {
        failures.push(`${source.name}: ${messageOf(error)}`);
      }
    }
    return failures.length > 0 ? failures.join('; ') : undefined;
  });
}

/** The calendar sync of the app: one run at a time, whether started by the scheduler or by hand. */
export function createCalendarSync(deps: {
  db: Db;
  listEvents: ListEvents;
  now: () => Date;
}): Sync {
  return oneAtATime('calendar', async () => {
    const sources = await listEnabledSources(deps.db);
    return syncCalendars({ ...deps, sources });
  });
}
