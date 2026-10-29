import type { DateKey } from '../dashboard/time.js';
import { weekdayName } from './week.js';

/**
 * What a system line of a meal's thread (GLOSSARY: Разговор) records. `replaced`: the recipe or the note changed;
 * `from` and `to` are the meal's titles (`mealTitle`), `null` for an empty meal. `swapped`: the meal swapped days with
 * another of its week; `date` is its day before the swap, `otherDate` the other meal's. Never stored: only the line's
 * text (`systemLine`) is.
 */
export type ThreadEvent =
  | { type: 'replaced'; from: string | null; to: string | null }
  | { type: 'swapped'; date: DateKey; otherDate: DateKey };

/** How a `swapped` line starts; no `replaced` template starts so. */
const SWAP_LEAD = 'размени ';

/** How a line of the former one-way move, written before „Размени с“ (#157), starts; such lines stay in older threads. */
const MOVE_LEAD = 'премести ';

/**
 * The body of a system line, without its author: the screen puts the author's name in front („Поли смени „Мусака“ →
 * „Пиле с ориз““, „Дани размени понеделник и неделя“). Fixed templates, so the line reads the same wherever it is
 * shown; a swap names the earlier day first, so both meals' threads get the same line.
 */
export function systemLine(event: ThreadEvent): string {
  if (event.type === 'swapped') {
    const { date, otherDate } = event;
    const [first, second] =
      date < otherDate ? [date, otherDate] : [otherDate, date];
    return `${SWAP_LEAD}${weekdayName(first)} и ${weekdayName(second)}`;
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
 * Whether a system line's `body` records that the meal only changed days (a `swapped` event, or a move from before
 * #157), not a `replaced` one. The line keeps only its text, so this reads it back from the fixed template.
 */
export function isMovedLine(body: string): boolean {
  return body.startsWith(SWAP_LEAD) || body.startsWith(MOVE_LEAD);
}
