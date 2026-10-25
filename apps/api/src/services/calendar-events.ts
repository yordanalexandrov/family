import {
  type CalendarEventsResponse,
  type DateKey,
  dedupeEvents,
  groupEventsByDay,
  startOfDayInSofia,
} from '@family/shared';
import type { Db } from '../db/client.js';
import { listCachedEvents } from '../db/repositories/calendar-events.js';

/** The cached events of the Sofia days `[from, to)`, an invitation in several calendars as one event. */
export async function readCalendarEvents(
  db: Db,
  from: DateKey,
  to: DateKey,
): Promise<CalendarEventsResponse> {
  const rows = await listCachedEvents(db, {
    from: startOfDayInSofia(from),
    to: startOfDayInSofia(to),
  });
  return { from, to, days: groupEventsByDay(dedupeEvents(rows), from, to) };
}
