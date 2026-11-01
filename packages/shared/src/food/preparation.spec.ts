import { describe, expect, it } from 'vitest';
import {
  formatMinutesBefore,
  preparationLabel,
  preparationSchema,
} from './preparation.js';

const oven = { kind: 'oven', degrees: 200, fan: 'fan', rack: 'middle' };

describe('preparationSchema', () => {
  it('accepts every kind: the oven with degrees, fan and an optional rack, the others with text and an optional time', () => {
    const items = [
      oven,
      { kind: 'fridge', text: 'извади маслото', minutesBefore: 60 },
      { kind: 'soak', text: 'накисни боба', minutesBefore: 720 },
      { kind: 'marinate', text: 'мариновай пилето' },
      { kind: 'boil', text: 'вода за пастата', minutesBefore: 15 },
      { kind: 'pan', text: 'намажи тавата' },
      { kind: 'rest', text: 'тестото да втаса', minutesBefore: 90 },
      { kind: 'other', text: 'подгрей чиниите' },
    ];

    expect(preparationSchema.parse(items)).toEqual(items);
  });

  it('accepts an empty list and an oven without a rack, with top and bottom heat', () => {
    expect(preparationSchema.parse([])).toEqual([]);
    const conventional = { kind: 'oven', degrees: 180, fan: 'conventional' };
    expect(preparationSchema.parse([conventional])).toEqual([conventional]);
  });

  it('refuses two ovens: only the first temperature is kept', () => {
    const result = preparationSchema.safeParse([
      oven,
      { kind: 'oven', degrees: 220, fan: 'conventional' },
    ]);
    expect(result.success).toBe(false);
  });

  it.each([29, 301, 180.5])('refuses an oven at %s degrees', (degrees) => {
    expect(preparationSchema.safeParse([{ ...oven, degrees }]).success).toBe(
      false,
    );
  });

  it('accepts the bounds of the degrees, 30 and 300', () => {
    expect(
      preparationSchema.safeParse([{ ...oven, degrees: 30 }]).success,
    ).toBe(true);
    expect(
      preparationSchema.safeParse([{ ...oven, degrees: 300 }]).success,
    ).toBe(true);
  });

  it('refuses an empty, a blank and a too long text, and accepts 60 characters', () => {
    const item = (text: string) => [{ kind: 'soak', text }];
    expect(preparationSchema.safeParse(item('')).success).toBe(false);
    expect(preparationSchema.safeParse(item('   ')).success).toBe(false);
    expect(preparationSchema.safeParse(item('а'.repeat(61))).success).toBe(
      false,
    );
    expect(preparationSchema.safeParse(item('а'.repeat(60))).success).toBe(
      true,
    );
  });

  it.each([0, 2881, 1.5])('refuses a time of %s minutes before', (minutes) => {
    expect(
      preparationSchema.safeParse([
        { kind: 'fridge', text: 'извади месото', minutesBefore: minutes },
      ]).success,
    ).toBe(false);
  });

  it('accepts the bounds of the time before, 1 and 2880 minutes', () => {
    for (const minutesBefore of [1, 2880]) {
      expect(
        preparationSchema.safeParse([
          { kind: 'fridge', text: 'извади месото', minutesBefore },
        ]).success,
      ).toBe(true);
    }
  });

  it('refuses 9 items and accepts 8', () => {
    const items = (count: number) =>
      Array.from({ length: count }, () => ({ kind: 'other', text: 'нещо' }));
    expect(preparationSchema.safeParse(items(8)).success).toBe(true);
    expect(preparationSchema.safeParse(items(9)).success).toBe(false);
  });

  it('refuses an unknown kind and the fields of another kind', () => {
    expect(
      preparationSchema.safeParse([{ kind: 'grill', text: 'запали скарата' }])
        .success,
    ).toBe(false);
    expect(
      preparationSchema.safeParse([{ kind: 'oven', text: 'загрей фурната' }])
        .success,
    ).toBe(false);
    expect(
      preparationSchema.safeParse([{ ...oven, fan: 'turbo' }]).success,
    ).toBe(false);
  });
});

describe('formatMinutesBefore', () => {
  it.each([
    [1, '1 мин преди'],
    [30, '30 мин преди'],
    [59, '59 мин преди'],
    [60, '1 ч преди'],
    [90, '1 ч 30 мин преди'],
    [120, '2 ч преди'],
    [479, '7 ч 59 мин преди'],
    [480, 'от вечерта'],
    [720, 'от вечерта'],
    [2880, 'от вечерта'],
  ])('%s минути → „%s“', (minutes, text) => {
    expect(formatMinutesBefore(minutes)).toBe(text);
  });
});

describe('preparationLabel', () => {
  it('the oven: degrees, fan and rack', () => {
    expect(
      preparationLabel({
        kind: 'oven',
        degrees: 200,
        fan: 'fan',
        rack: 'middle',
      }),
    ).toBe('200° · с вентилатор · средна скара');
    expect(
      preparationLabel({ kind: 'oven', degrees: 180, fan: 'conventional' }),
    ).toBe('180° · без вентилатор');
  });

  it('the other kinds: the text and the time before', () => {
    expect(
      preparationLabel({
        kind: 'soak',
        text: 'накисни боба',
        minutesBefore: 720,
      }),
    ).toBe('накисни боба · от вечерта');
    expect(preparationLabel({ kind: 'pan', text: 'намажи тавата' })).toBe(
      'намажи тавата',
    );
  });
});
