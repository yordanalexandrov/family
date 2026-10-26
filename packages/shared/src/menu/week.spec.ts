import { describe, expect, it } from 'vitest';
import {
  daysOfWeek,
  hasWeekStarted,
  isWeekStart,
  MENU_SLOTS,
  weekStartOf,
} from './week.js';

describe('weekStartOf', () => {
  it('is the Monday of a midweek day', () => {
    // Thursday 29 October 2026, noon in Sofia.
    expect(weekStartOf(new Date('2026-10-29T10:00:00Z'))).toBe('2026-10-26');
  });

  it('is the same day on a Monday', () => {
    expect(weekStartOf(new Date('2026-10-26T08:00:00Z'))).toBe('2026-10-26');
  });

  it('keeps Sunday evening in its own week', () => {
    // Sunday 1 November, 23:30 in Sofia (EET, UTC+2).
    expect(weekStartOf(new Date('2026-11-01T21:30:00Z'))).toBe('2026-10-26');
  });

  it('moves to the next week at Monday 00:00 in Sofia, while it is still Sunday in UTC', () => {
    // Monday 2 November, 00:30 in Sofia = Sunday 22:30 UTC.
    expect(weekStartOf(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-02');
  });

  it('crosses the year: 1 January 2027 (Friday) belongs to the week of 28 December 2026', () => {
    expect(weekStartOf(new Date('2027-01-01T12:00:00Z'))).toBe('2026-12-28');
  });
});

describe('daysOfWeek', () => {
  it('lists Monday to Sunday', () => {
    expect(daysOfWeek('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('crosses the year', () => {
    expect(daysOfWeek('2026-12-28')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });
});

describe('hasWeekStarted', () => {
  it('is false on the Sunday evening before', () => {
    expect(hasWeekStarted('2026-11-02', new Date('2026-11-01T21:59:00Z'))).toBe(
      false,
    );
  });

  it('is true from Monday 00:00 local time', () => {
    expect(hasWeekStarted('2026-11-02', new Date('2026-11-01T22:00:00Z'))).toBe(
      true,
    );
  });

  it('stays true after the week is over', () => {
    expect(hasWeekStarted('2026-10-26', new Date('2027-01-01T12:00:00Z'))).toBe(
      true,
    );
  });
});

describe('isWeekStart', () => {
  it('accepts a Monday and refuses any other day', () => {
    expect(isWeekStart('2026-12-28')).toBe(true);
    expect(isWeekStart('2027-01-03')).toBe(false);
  });
});

describe('MENU_SLOTS', () => {
  it('plans only dinner in phase 1', () => {
    expect(MENU_SLOTS).toEqual(['dinner']);
  });
});
