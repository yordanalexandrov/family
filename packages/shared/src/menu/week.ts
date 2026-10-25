import { addDays, type DateKey, FAMILY_TIME_ZONE } from '../dashboard/time.js';
import type { Slot } from '../food/tags.js';

/**
 * The weekly menu (GLOSSARY: Седмично меню) runs Monday to Sunday in local time and is identified by its
 * `weekStart`, the Monday as `YYYY-MM-DD`.
 */

/** The slots a weekly menu plans; phase 1 plans dinner only, so a plan has 7 meals. */
export const MENU_SLOTS = ['dinner'] as const satisfies readonly Slot[];

export type MenuSlot = (typeof MENU_SLOTS)[number];

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** The calendar date of `date` in `tz`, as `YYYY-MM-DD`. */
function dateKeyIn(date: Date, tz: string): DateKey {
  let format = dateFormats.get(tz);
  if (!format) {
    // `en-CA` formats dates as YYYY-MM-DD.
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormats.set(tz, format);
  }
  return format.format(date);
}

/** Day of the week of a date key, 0 = Monday … 6 = Sunday. */
function weekdayOf(key: DateKey): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Whether `key` is a Monday, i.e. a valid `weekStart`. */
export function isWeekStart(key: DateKey): boolean {
  return weekdayOf(key) === 0;
}

/** The Monday of the week that `date` falls in, by the calendar in `tz`. */
export function weekStartOf(
  date: Date,
  tz: string = FAMILY_TIME_ZONE,
): DateKey {
  const key = dateKeyIn(date, tz);
  return addDays(key, -weekdayOf(key));
}

/** The 7 dates of the week starting on `weekStart`, Monday to Sunday. */
export function daysOfWeek(weekStart: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, day) => addDays(weekStart, day));
}

/** Whether the week has begun at `now`: from Monday 00:00 in `tz` on (a plan can then no longer be deleted). */
export function hasWeekStarted(
  weekStart: DateKey,
  now: Date,
  tz: string = FAMILY_TIME_ZONE,
): boolean {
  return dateKeyIn(now, tz) >= weekStart;
}
