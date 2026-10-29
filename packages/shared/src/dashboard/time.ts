import type { CalendarEvent, DayEvents } from '../schemas/calendar.js';

/** The family's time zone: every "today", day boundary and theme hour of the dashboard is in it. */
export const FAMILY_TIME_ZONE = 'Europe/Sofia';

/** A calendar date as `YYYY-MM-DD`. */
export type DateKey = string;

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: FAMILY_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What a clock in Sofia shows at `date`. */
function wallClockInSofia(date: Date): WallClock {
  const clock: WallClock = {
    year: 0,
    month: 0,
    day: 0,
    hour: 0,
    minute: 0,
    second: 0,
  };
  for (const { type, value } of partsFormat.formatToParts(date)) {
    if (type in clock) {
      clock[type as keyof WallClock] = Number(value);
    }
  }
  return clock;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Milliseconds of 00:00 UTC on the date `key`; calendar arithmetic only, not a Sofia instant. */
export function utcMidnightOf(key: DateKey): number {
  return Date.parse(`${key}T00:00:00Z`);
}

/** Milliseconds in a day of 24 hours. */
export const DAY_MS = 86_400_000;

/** Calendar days from `from` to `to`: 0 for the same day, negative when `to` is earlier. */
export function daysBetween(from: DateKey, to: DateKey): number {
  return (utcMidnightOf(to) - utcMidnightOf(from)) / DAY_MS;
}

/** The Sofia calendar date of `date`. */
export function dateKeyInSofia(date: Date): DateKey {
  const { year, month, day } = wallClockInSofia(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The instant 00:00 in Sofia on the day of `date` (an instant, or a date key). */
export function startOfDayInSofia(date: Date | DateKey): Date {
  const key = typeof date === 'string' ? date : dateKeyInSofia(date);
  const midnightAsUtc = utcMidnightOf(key);
  // Sofia's offset at that moment; midnight is never inside a DST jump there (they happen at 03:00/04:00).
  const clock = wallClockInSofia(new Date(midnightAsUtc));
  const offsetMs =
    Date.UTC(
      clock.year,
      clock.month - 1,
      clock.day,
      clock.hour,
      clock.minute,
      clock.second,
    ) - midnightAsUtc;
  return new Date(midnightAsUtc - offsetMs);
}

/**
 * The instant `hour`:00 in Sofia on `date`, counted back from the next midnight: the DST jumps there are at 03:00/04:00,
 * so this holds for hours from 04:00 on.
 */
export function atHourInSofia(date: DateKey, hour: number): number {
  return (
    startOfDayInSofia(addDays(date, 1)).getTime() - (24 - hour) * 3_600_000
  );
}

/** The date key `days` calendar days after `key` (negative: before). */
export function addDays(key: DateKey, days: number): DateKey {
  const date = new Date(utcMidnightOf(key));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export type Theme = 'light' | 'dark';

/** The default theme of the dashboard by the hour in Sofia: dark from 20:00 until 07:00. */
export function themeForHour(now: Date): Theme {
  const { hour } = wallClockInSofia(now);
  return hour >= 20 || hour < 7 ? 'dark' : 'light';
}

function compareForDay(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) {
    return a.allDay ? -1 : 1;
  }
  return (
    Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title)
  );
}

/** Whether `event` takes place on `day`: overlapping any part of it, or (zero-length) starting in it. */
function isOnDay(event: CalendarEvent, day: DateKey): boolean {
  if (event.allDay) {
    // Compared as dates, so the exclusive end never spills into the next day.
    return (
      dateKeyInSofia(new Date(event.start)) <= day &&
      day < dateKeyInSofia(new Date(event.end))
    );
  }
  const dayStart = startOfDayInSofia(day).getTime();
  const dayEnd = startOfDayInSofia(addDays(day, 1)).getTime();
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  return start < dayEnd && (end > dayStart || start >= dayStart);
}

/**
 * One entry per Sofia day from `from` up to `toExclusive`, empty days included.
 * An event spanning several days is in each of them; all-day events come first, then by start.
 */
export function groupEventsByDay(
  events: CalendarEvent[],
  from: DateKey,
  toExclusive: DateKey,
): DayEvents[] {
  const sorted = [...events].sort(compareForDay);
  const days: DayEvents[] = [];
  for (let day = from; day < toExclusive; day = addDays(day, 1)) {
    days.push({
      date: day,
      events: sorted.filter((event) => isOnDay(event, day)),
    });
  }
  return days;
}
