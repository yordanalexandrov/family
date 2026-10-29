import { describe, expect, it } from 'vitest';
import { formatMinutes } from './format';

describe('formatMinutes', () => {
  it.each([
    [45, '45 мин'],
    [60, '60 мин'],
    [225, '3 ч 45 мин'],
    [1020, '17 ч'],
    [1440, '1 ден'],
    [1500, '1 ден 1 ч'],
    [3000, '2 дни 2 ч'],
  ])('%i мин → „%s“', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});
