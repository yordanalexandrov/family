import { z } from 'zod';
import { dateKeySchema, instantSchema } from './dates.js';

/** Name of the design token a calendar source is drawn with, never a CSS value. */
export const calendarColorTokenSchema = z.enum([
  'person-1',
  'person-2',
  'family',
]);

export type CalendarColorToken = z.infer<typeof calendarColorTokenSchema>;

/** GLOSSARY: Източник на календар. A person's calendar has an owner; the family one has none. */
export const calendarSourceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  ownerUserId: z.uuid().nullable(),
  colorToken: calendarColorTokenSchema,
  kind: z.enum(['person', 'family']),
});

export type CalendarSource = z.infer<typeof calendarSourceSchema>;

/**
 * GLOSSARY: Събитие. The same event reached through several sources (an invitation) is one event with all of them in `sources`.
 * An all-day event runs from 00:00 Sofia of its first day to 00:00 Sofia of the day after its last (exclusive end).
 */
export const calendarEventSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  start: instantSchema,
  end: instantSchema,
  allDay: z.boolean(),
  location: z.string().nullable().optional(),
  htmlLink: z.string().nullable().optional(),
  sources: z.array(calendarSourceSchema).min(1),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

/** The events of one Sofia day: all-day ones first, then by start. */
export const dayEventsSchema = z.object({
  date: dateKeySchema,
  events: z.array(calendarEventSchema),
});

export type DayEvents = z.infer<typeof dayEventsSchema>;

/** `GET /api/calendar/events`: one entry per day from `from` (inclusive) to `to` (exclusive), empty days included. */
export const calendarEventsResponseSchema = z.object({
  from: dateKeySchema,
  to: dateKeySchema,
  days: z.array(dayEventsSchema),
});

export type CalendarEventsResponse = z.infer<
  typeof calendarEventsResponseSchema
>;

/** The most days `GET /api/calendar/events` answers at once: the sync window. */
export const CALENDAR_MAX_DAYS = 14;

/**
 * Query of `GET /api/calendar/events`: `to` is exclusive; by default today and `CALENDAR_MAX_DAYS` days on.
 * The api also refuses `to` not after `from` or more than `CALENDAR_MAX_DAYS` days apart.
 */
export const calendarEventsQuerySchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
});

export type CalendarEventsQuery = z.infer<typeof calendarEventsQuerySchema>;
