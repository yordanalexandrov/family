import type { CalendarSource } from '@family/shared';
import { eq, notInArray, sql } from 'drizzle-orm';
import type { CalendarSourceConfig } from '../../config.js';
import type { Db } from '../client.js';
import { calendarSource } from '../schema/dashboard.js';

/** A calendar source as the sync needs it: the API shape plus the Google calendar to read. */
export type EnabledCalendarSource = CalendarSource & {
  googleCalendarId: string;
};

const sourceColumns = {
  id: calendarSource.id,
  googleCalendarId: calendarSource.googleCalendarId,
  name: calendarSource.name,
  ownerUserId: calendarSource.ownerUserId,
  colorToken: calendarSource.colorToken,
  kind: calendarSource.kind,
};

/**
 * Makes the table match GOOGLE_CALENDARS: inserts or updates every calendar by `google_calendar_id`
 * (enabling it), and disables the ones no longer listed, so their cached events stay until the next sync.
 * A calendar without an owner is the family one.
 */
export async function upsertCalendarSources(
  db: Db,
  fromEnv: CalendarSourceConfig[],
): Promise<void> {
  await db.transaction(async (tx) => {
    if (fromEnv.length > 0) {
      await tx
        .insert(calendarSource)
        .values(
          fromEnv.map((calendar) => ({
            googleCalendarId: calendar.googleCalendarId,
            name: calendar.name,
            ownerUserId: calendar.ownerUserId,
            colorToken: calendar.colorToken,
            kind:
              calendar.ownerUserId === null
                ? ('family' as const)
                : ('person' as const),
            enabled: true,
          })),
        )
        .onConflictDoUpdate({
          target: calendarSource.googleCalendarId,
          set: {
            name: sql`excluded.name`,
            ownerUserId: sql`excluded.owner_user_id`,
            colorToken: sql`excluded.color_token`,
            kind: sql`excluded.kind`,
            enabled: true,
          },
        });
    }
    await tx
      .update(calendarSource)
      .set({ enabled: false })
      .where(
        notInArray(
          calendarSource.googleCalendarId,
          fromEnv.map((calendar) => calendar.googleCalendarId),
        ),
      );
  });
}

/** The calendar sources to sync and show, by name. */
export async function listEnabledSources(
  db: Db,
): Promise<EnabledCalendarSource[]> {
  return db
    .select(sourceColumns)
    .from(calendarSource)
    .where(eq(calendarSource.enabled, true))
    .orderBy(calendarSource.name);
}
