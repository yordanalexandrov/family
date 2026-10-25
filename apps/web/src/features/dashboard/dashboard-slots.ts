/*
 * Именуваните слотове на kiosk/TV решетката (#45, Дашборд 5). Кой епик пълни кой:
 *   core        Дашборд: ядрото (часовник, дата, днешните събития, „Днес се готви“).
 *   left-1      Дашборд: бюджетът.
 *   left-2      свободен (по-късна фаза).
 *   right-1     Дашборд: следващите дни.
 *   right-2     Списък за пазаруване: пазаруването вдясно под дните.
 *   below-core  Седмично меню: менюто под ядрото.
 *
 * Празен слот не е в решетката: `gridTemplateRows()` строи областите само от
 * запълнените, затова не остават празни редове и междини.
 */
export type SlotName =
  | 'core'
  | 'left-1'
  | 'left-2'
  | 'right-1'
  | 'right-2'
  | 'below-core';

/** `wide`: TV (≥ 1600 px), три колони. `narrow`: kiosk (< 1600 px), две колони. */
export type KioskGrid = 'wide' | 'narrow';

/** Медийната заявка за `wide`, единственият източник на границата; CSS-ът я повтаря в KioskLayout.css и GlassScreen.css. */
export const WIDE_QUERY = '(min-width: 1600px)';

/** Колоните отляво надясно, слотовете във всяка отгоре надолу. */
const COLUMNS: Record<KioskGrid, SlotName[][]> = {
  wide: [
    ['left-1', 'left-2'],
    ['core', 'below-core'],
    ['right-1', 'right-2'],
  ],
  // Две колони: ядрото вляво, `left-*` се подреждат в дясната колона над `right-*`.
  narrow: [
    ['core', 'below-core'],
    ['left-1', 'left-2', 'right-1', 'right-2'],
  ],
};

function filledColumns(grid: KioskGrid, filled: readonly SlotName[]) {
  return COLUMNS[grid].map((column) =>
    column.filter((slot) => filled.includes(slot)),
  );
}

/**
 * Редовете на `grid-template` (областите с височините им) от запълнените слотове:
 * толкова реда, колкото е най-дългата колона, по-късата колона разтяга последния си
 * слот надолу, празната е `.`. Отгоре и отдолу има празен ред `1fr`, в който влиза
 * само колоната на ядрото, така че картите стоят на куп във вертикалния център.
 */
export function gridTemplateRows(grid: KioskGrid, filled: readonly SlotName[]) {
  const columns = filledColumns(grid, filled);
  const rows = Math.max(1, ...columns.map((column) => column.length));
  const row = (cells: string[], size: string) => `"${cells.join(' ')}" ${size}`;
  const spacer = (pick: (column: SlotName[]) => SlotName | undefined) =>
    row(
      columns.map((column) =>
        column.includes('core') ? (pick(column) ?? '.') : '.',
      ),
      '1fr',
    );
  return [
    spacer((column) => column[0]),
    ...Array.from({ length: rows }, (_, index) =>
      row(
        columns.map(
          (column) => column[Math.min(index, column.length - 1)] ?? '.',
        ),
        'auto',
      ),
    ),
    spacer((column) => column.at(-1)),
  ].join(' ');
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Съседният запълнен слот в посоката, както е нареден на екрана: нагоре/надолу в
 * същата колона, наляво/надясно в най-близката непразна колона, на същия или
 * най-близкия ред. Без съсед — `null` (фокусът остава).
 */
export function neighbourSlot(
  grid: KioskGrid,
  filled: readonly SlotName[],
  from: SlotName,
  direction: Direction,
): SlotName | null {
  const columns = filledColumns(grid, filled).filter(
    (column) => column.length > 0,
  );
  const col = columns.findIndex((column) => column.includes(from));
  if (col === -1) {
    return null;
  }
  const row = columns[col]?.indexOf(from) ?? 0;
  if (direction === 'up' || direction === 'down') {
    return columns[col]?.[row + (direction === 'up' ? -1 : 1)] ?? null;
  }
  const target = columns[col + (direction === 'left' ? -1 : 1)];
  if (!target) {
    return null;
  }
  return target[Math.min(row, target.length - 1)] ?? null;
}
