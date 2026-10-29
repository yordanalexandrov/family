import type { DateKey } from '../dashboard/time.js';
import { weekdayOf } from './week.js';

/**
 * What a system line of a meal's thread (GLOSSARY: Разговор) records. `replaced`: the recipe or the note changed;
 * `from` and `to` are the meal's titles (`mealTitle`), `null` for an empty meal. `moved`: the meal swapped days with
 * another of its week.
 */
export type ThreadEvent =
  | { type: 'replaced'; from: string | null; to: string | null }
  | { type: 'moved'; fromDate: DateKey; toDate: DateKey };

/** Weekday names, Monday first, in the form „от вторник на сряда“ takes. */
const WEEKDAYS = [
  'понеделник',
  'вторник',
  'сряда',
  'четвъртък',
  'петък',
  'събота',
  'неделя',
] as const;

function weekdayName(key: DateKey): string {
  return WEEKDAYS[weekdayOf(key)] ?? key;
}

/** How a `moved` line starts; no `replaced` template starts so. */
const MOVED_LEAD = 'премести ';

/**
 * The body of a system line, without its author: the screen puts the author's name in front („Поли смени „Мусака“ →
 * „Пиле с ориз““). Fixed templates, so the line reads the same wherever it is shown.
 */
export function systemLine(event: ThreadEvent): string {
  if (event.type === 'moved') {
    return `${MOVED_LEAD}от ${weekdayName(event.fromDate)} на ${weekdayName(event.toDate)}`;
  }
  if (event.from === null) {
    return `избра „${event.to ?? ''}“`;
  }
  if (event.to === null) {
    return `махна „${event.from}“`;
  }
  return `смени „${event.from}“ → „${event.to}“`;
}

/**
 * Whether a system line's `body` records a `moved` event (the meal only changed days), not a `replaced` one. The
 * line keeps only its text, so this reads it back from the fixed template.
 */
export function isMovedLine(body: string): boolean {
  return body.startsWith(MOVED_LEAD);
}
