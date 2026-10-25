import type { CalendarEvent, CalendarSource } from '../schemas/calendar.js';

/** One cached event as read from one calendar source, before deduplication. */
export type CalendarEventRow = Omit<CalendarEvent, 'sources'> & {
  /** Google's iCalUID: the same for an event in every calendar it is in. */
  icalUid: string | null;
  /** For an instance of a recurring series, its originally scheduled start; tells instances apart. */
  originalStart: string | null;
  source: CalendarSource;
};

/**
 * GLOSSARY: Събитие. Rows with the same `icalUid` and `originalStart` are one event (an invitation in
 * several calendars) whose `sources` lists every calendar it came from; the first row gives the rest of
 * its fields. Rows without an `icalUid` are never merged. Ordered by start.
 */
export function dedupeEvents(rows: CalendarEventRow[]): CalendarEvent[] {
  const byKey = new Map<string, CalendarEvent>();
  const events: CalendarEvent[] = [];
  for (const { icalUid, originalStart, source, ...fields } of rows) {
    const key =
      icalUid === null ? null : JSON.stringify([icalUid, originalStart]);
    const existing = key === null ? undefined : byKey.get(key);
    if (existing) {
      if (!existing.sources.some((known) => known.id === source.id)) {
        existing.sources.push(source);
      }
      continue;
    }
    const event: CalendarEvent = { ...fields, sources: [source] };
    events.push(event);
    if (key !== null) {
      byKey.set(key, event);
    }
  }
  return events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
