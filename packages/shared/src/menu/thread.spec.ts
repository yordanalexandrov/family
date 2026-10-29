import { describe, expect, it } from 'vitest';
import { isMovedLine, systemLine } from './thread.js';

describe('systemLine', () => {
  it('says which recipe replaced which', () => {
    expect(
      systemLine({ type: 'replaced', from: 'Мусака', to: 'Пиле с ориз' }),
    ).toBe('смени „Мусака“ → „Пиле с ориз“');
  });

  it('names a note like a recipe: recipe → note', () => {
    expect(
      systemLine({ type: 'replaced', from: 'Мусака', to: 'ядем навън' }),
    ).toBe('смени „Мусака“ → „ядем навън“');
  });

  it('an empty meal that gets a recipe was chosen, not replaced', () => {
    expect(systemLine({ type: 'replaced', from: null, to: 'Мусака' })).toBe(
      'избра „Мусака“',
    );
  });

  it('a meal emptied of its recipe was cleared', () => {
    expect(systemLine({ type: 'replaced', from: 'Мусака', to: null })).toBe(
      'махна „Мусака“',
    );
  });

  it('says which two days swapped, earlier day first, the same in both threads', () => {
    expect(
      systemLine({
        type: 'swapped',
        date: '2026-10-26',
        otherDate: '2026-11-01',
      }),
    ).toBe('размени понеделник и неделя');
    expect(
      systemLine({
        type: 'swapped',
        date: '2026-11-01',
        otherDate: '2026-10-26',
      }),
    ).toBe('размени понеделник и неделя');
  });
});

describe('isMovedLine', () => {
  it('tells a swap line from a replaced one', () => {
    expect(
      isMovedLine(
        systemLine({
          type: 'swapped',
          date: '2026-10-27',
          otherDate: '2026-10-28',
        }),
      ),
    ).toBe(true);
    // Lines written before the swap wording stay in old threads.
    expect(isMovedLine('премести от вторник на сряда')).toBe(true);
    for (const [from, to] of [
      ['Мусака', 'Пиле с ориз'],
      [null, 'премести масата'],
      [null, 'размени масата'],
      ['Мусака', null],
    ] as const) {
      expect(isMovedLine(systemLine({ type: 'replaced', from, to }))).toBe(
        false,
      );
    }
  });
});
