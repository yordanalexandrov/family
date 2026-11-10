import { describe, expect, it } from 'vitest';
import { isAiLine, isMovedLine, systemLine } from './thread.js';

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

describe('systemLine of the menu rework', () => {
  it('says the AI replaced one meal with another', () => {
    expect(
      systemLine({ type: 'reworked', from: 'Мусака', to: 'Пъстърва' }),
    ).toBe('AI смени „Мусака“ с „Пъстърва“ при преработката на менюто');
  });

  it('says the AI put a recipe on an empty day', () => {
    expect(systemLine({ type: 'reworked', from: null, to: 'Пъстърва' })).toBe(
      'AI сложи „Пъстърва“ при преработката на менюто',
    );
  });
});

describe('isAiLine', () => {
  it('tells a line of the rework, shown without its author, from a person’s', () => {
    expect(
      isAiLine(
        systemLine({ type: 'reworked', from: 'Мусака', to: 'Пъстърва' }),
      ),
    ).toBe(true);
    expect(
      isAiLine(systemLine({ type: 'replaced', from: 'AI', to: 'Пъстърва' })),
    ).toBe(false);
    expect(
      isAiLine(systemLine({ type: 'replaced', from: null, to: 'AI' })),
    ).toBe(false);
  });

  it('is not moved', () => {
    expect(
      isMovedLine(systemLine({ type: 'reworked', from: null, to: 'Пъстърва' })),
    ).toBe(false);
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
