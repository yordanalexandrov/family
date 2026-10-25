import type { CalendarEventRow } from '@family/shared';
import { and, asc, eq, gt, gte, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { calendarEvent, calendarSource } from '../schema/dashboard.js';

export type NewCalendarEvent = typeof calendarEvent.$inferInsert;

/** A stretch of time `[from, to)`: the sync window, or the days a reader asks for. */
export interface TimeWindow {
  from: Date;
  to: Date;
}

/** Events overlapping `window`; a zero-length event counts when it starts inside. */
function inWindow({ from, to }: TimeWindow) {
  return and(
    lt(calendarEvent.start, to),
    or(gt(calendarEvent.end, from), gte(calendarEvent.start, from)),
  );
}

/**
 * Replaces the cached events of one source inside `window` with `rows`, in one transaction, so a reader sees
 * either the old or the new events. An event that moved into the window from outside it keeps its row (by
 * `(calendar_source_id, external_id)`) and is updated.
 */
export async function replaceSourceEvents(
  db: Db,
  calendarSourceId: string,
  window: TimeWindow,
  rows: NewCalendarEvent[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(calendarEvent)
      .where(
        and(
          eq(calendarEvent.calendarSourceId, calendarSourceId),
          inWindow(window),
        ),
      );
    if (rows.length > 0) {
      await tx
        .insert(calendarEvent)
        .values(rows)
        .onConflictDoUpdate({
          target: [calendarEvent.calendarSourceId, calendarEvent.externalId],
          set: {
            icalUid: sql`excluded.ical_uid`,
            originalStart: sql`excluded.original_start`,
            title: sql`excluded.title`,
            start: sql`excluded.start`,
            end: sql`excluded.end`,
            allDay: sql`excluded.all_day`,
            location: sql`excluded.location`,
            htmlLink: sql`excluded.html_link`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  });
}

/** The cached events of enabled sources overlapping `window`, one row per source, by start. */
export async function listCachedEvents(
  db: Db,
  window: TimeWindow,
): Promise<CalendarEventRow[]> {
  const rows = await db
    .select({
      event: calendarEvent,
      source: {
        id: calendarSource.id,
        name: calendarSource.name,
        ownerUserId: calendarSource.ownerUserId,
        colorToken: calendarSource.colorToken,
        kind: calendarSource.kind,
      },
    })
    .from(calendarEvent)
    .innerJoin(
      calendarSource,
      eq(calendarEvent.calendarSourceId, calendarSource.id),
    )
    .where(and(eq(calendarSource.enabled, true), inWindow(window)))
    .orderBy(asc(calendarEvent.start), asc(calendarEvent.id));
  return rows.map(({ event, source }) => ({
    id: event.id,
    title: event.title,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    allDay: event.allDay,
    location: event.location,
    htmlLink: event.htmlLink,
    icalUid: event.icalUid,
    originalStart: event.originalStart?.toISOString() ?? null,
    source,
  }));
}
