import type { DateKey } from '../dashboard/time.js';
import { weekdayName } from './week.js';

/**
 * What a system line of a meal's thread (GLOSSARY: Разговор) records. `replaced`: the recipe or the note changed;
 * `from` and `to` are the meal's titles (`mealTitle`), `null` for an empty meal. `swapped`: the meal swapped days with
 * another of its week; `date` is its day before the swap, `otherDate` the other meal's. `reworked`: the menu rework
 * (GLOSSARY: Преработка на менюто) put the recipe `to` on the day, instead of `from` (`null` for an empty day). Never
 * stored: only the line's text (`systemLine`) is.
 */
export type ThreadEvent =
  | { type: 'replaced'; from: string | null; to: string | null }
  | { type: 'swapped'; date: DateKey; otherDate: DateKey }
  | { type: 'reworked'; from: string | null; to: string };

/** How a `reworked` line starts: the AI, not the person who asked for the rework, made the change. */
const AI_LEAD = 'AI ';

/** How a `swapped` line starts; no `replaced` template starts so. */
const SWAP_LEAD = 'размени ';

/** How a line of the former one-way move, written before „Размени с“ (#157), starts; such lines stay in older threads. */
const MOVE_LEAD = 'премести ';

/**
 * The body of a system line, without its author: the screen puts the author's name in front („Поли смени „Мусака“ →
 * „Пиле с ориз““, „Дани размени понеделник и неделя“), except a `reworked` line, which names the AI itself
 * (`isAiLine`) and is shown without its author. Fixed templates, so the line reads the same wherever it is
 * shown; a swap names the earlier day first, so both meals' threads get the same line.
 */
export function systemLine(event: ThreadEvent): string {
  if (event.type === 'swapped') {
    const { date, otherDate } = event;
    const [first, second] =
      date < otherDate ? [date, otherDate] : [otherDate, date];
    return `${SWAP_LEAD}${weekdayName(first)} и ${weekdayName(second)}`;
  }
  if (event.type === 'reworked') {
    return event.from === null
      ? `${AI_LEAD}сложи „${event.to}“ при преработката на менюто`
      : `${AI_LEAD}смени „${event.from}“ с „${event.to}“ при преработката на менюто`;
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

/**
 * Whether a system line's `body` was written by the menu rework (a `reworked` event): it starts with „AI “ and the
 * screen shows it without the name of who asked for the rework. No other template starts so.
 */
export function isAiLine(body: string): boolean {
  return body.startsWith(AI_LEAD);
}
