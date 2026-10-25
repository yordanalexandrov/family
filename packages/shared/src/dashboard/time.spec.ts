import { describe, expect, it } from 'vitest';
import type { CalendarEvent, DayEvents } from '../schemas/calendar.js';
import {
  addDays,
  dateKeyInSofia,
  groupEventsByDay,
  startOfDayInSofia,
  themeForHour,
} from './time.js';

describe('startOfDayInSofia', () => {
  it('is midnight in Sofia, in winter time (UTC+2)', () => {
    expect(
      startOfDayInSofia(new Date('2026-01-15T10:30:00Z')).toISOString(),
    ).toBe('2026-01-14T22:00:00.000Z');
  });

  it('is midnight in Sofia, in summer time (UTC+3)', () => {
    expect(
      startOfDayInSofia(new Date('2026-07-15T10:30:00Z')).toISOString(),
    ).toBe('2026-07-14T21:00:00.000Z');
  });

  it('on 29 March (clocks go forward) the day starts in winter time', () => {
    expect(
      startOfDayInSofia(new Date('2026-03-29T12:00:00Z')).toISOString(),
    ).toBe('2026-03-28T22:00:00.000Z');
    // The next day already starts in summer time.
    expect(
      startOfDayInSofia(new Date('2026-03-29T21:30:00Z')).toISOString(),
    ).toBe('2026-03-29T21:00:00.000Z');
  });

  it('on 25 October (clocks go back) the day starts in summer time', () => {
    expect(
      startOfDayInSofia(new Date('2026-10-25T12:00:00Z')).toISOString(),
    ).toBe('2026-10-24T21:00:00.000Z');
    // 23:30 Sofia on 25 October is still that day, an hour later in UTC than in summer.
    expect(
      startOfDayInSofia(new Date('2026-10-25T21:30:00Z')).toISOString(),
    ).toBe('2026-10-24T21:00:00.000Z');
  });

  it('accepts a date key', () => {
    expect(startOfDayInSofia('2026-10-26').toISOString()).toBe(
      '2026-10-25T22:00:00.000Z',
    );
  });
});

describe('dateKeyInSofia', () => {
  it('is the Sofia calendar date, not the UTC one', () => {
    expect(dateKeyInSofia(new Date('2026-10-24T21:30:00Z'))).toBe('2026-10-25');
    expect(dateKeyInSofia(new Date('2026-10-24T20:59:59Z'))).toBe('2026-10-24');
  });
});

describe('addDays', () => {
  it('moves a date key across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts calendar days across the DST change, not 24-hour steps', () => {
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(startOfDayInSofia(addDays('2026-03-28', 2)).toISOString()).toBe(
      '2026-03-29T21:00:00.000Z',
    );
  });
});

describe('themeForHour', () => {
  // Summer time: Sofia is UTC+3.
  it.each([
    ['2026-07-15T16:59:00Z', '19:59', 'light'],
    ['2026-07-15T17:00:00Z', '20:00', 'dark'],
    ['2026-07-15T03:59:00Z', '06:59', 'dark'],
    ['2026-07-15T04:00:00Z', '07:00', 'light'],
  ])('at %s (%s in Sofia) is %s', (iso, _sofia, theme) => {
    expect(themeForHour(new Date(iso))).toBe(theme);
  });

  it('follows Sofia time in winter too (20:00 is 18:00 UTC)', () => {
    expect(themeForHour(new Date('2026-01-15T17:59:00Z'))).toBe('light');
    expect(themeForHour(new Date('2026-01-15T18:00:00Z'))).toBe('dark');
  });
});

const source = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Дани',
  ownerUserId: '11111111-1111-4111-8111-111111111111',
  colorToken: 'person-1' as const,
  kind: 'person' as const,
};

let nextId = 0;
function event(
  title: string,
  start: string,
  end: string,
  allDay = false,
): CalendarEvent {
  nextId += 1;
  return {
    id: `eeeeeeee-eeee-4eee-8eee-${String(nextId).padStart(12, '0')}`,
    title,
    start,
    end,
    allDay,
    sources: [source],
  };
}

function titlesByDay(days: DayEvents[]) {
  return days.map((day) => [day.date, day.events.map((e) => e.title)]);
}

describe('groupEventsByDay', () => {
  it('returns every day of the range, empty days included', () => {
    expect(groupEventsByDay([], '2026-10-24', '2026-10-27')).toEqual([
      { date: '2026-10-24', events: [] },
      { date: '2026-10-25', events: [] },
      { date: '2026-10-26', events: [] },
    ]);
  });

  it('puts an event through midnight into both days', () => {
    // 23:00 on 25 Oct to 01:00 on 26 Oct, Sofia (UTC+2 after the change).
    const party = event(
      'Купон',
      '2026-10-25T21:00:00.000Z',
      '2026-10-25T23:00:00.000Z',
    );

    expect(
      titlesByDay(groupEventsByDay([party], '2026-10-25', '2026-10-27')),
    ).toEqual([
      ['2026-10-25', ['Купон']],
      ['2026-10-26', ['Купон']],
    ]);
  });

  it('does not put an event ending exactly at midnight into the next day', () => {
    const evening = event(
      'Вечеря',
      '2026-10-25T20:00:00.000Z',
      '2026-10-25T22:00:00.000Z',
    );

    expect(
      titlesByDay(groupEventsByDay([evening], '2026-10-25', '2026-10-27')),
    ).toEqual([
      ['2026-10-25', ['Вечеря']],
      ['2026-10-26', []],
    ]);
  });

  it('treats the end of an all-day event as exclusive', () => {
    // All day on 26 and 27 Oct: ends at 00:00 Sofia on 28 Oct.
    const trip = event(
      'Екскурзия',
      '2026-10-25T22:00:00.000Z',
      '2026-10-27T22:00:00.000Z',
      true,
    );

    expect(
      titlesByDay(groupEventsByDay([trip], '2026-10-25', '2026-10-29')),
    ).toEqual([
      ['2026-10-25', []],
      ['2026-10-26', ['Екскурзия']],
      ['2026-10-27', ['Екскурзия']],
      ['2026-10-28', []],
    ]);
  });

  it('keeps day boundaries in Sofia across the DST change (25 October)', () => {
    // 00:30 Sofia on 25 Oct is still summer time (21:30 UTC on the 24th);
    // 23:30 Sofia on 25 Oct is already winter time (21:30 UTC on the 25th).
    const early = event(
      'Рано',
      '2026-10-24T21:30:00.000Z',
      '2026-10-24T22:00:00.000Z',
    );
    const late = event(
      'Късно',
      '2026-10-25T21:30:00.000Z',
      '2026-10-25T21:45:00.000Z',
    );

    expect(
      titlesByDay(groupEventsByDay([late, early], '2026-10-24', '2026-10-27')),
    ).toEqual([
      ['2026-10-24', []],
      ['2026-10-25', ['Рано', 'Късно']],
      ['2026-10-26', []],
    ]);
  });

  it('lists all-day events first, then the rest by start', () => {
    const lunch = event(
      'Обяд',
      '2026-10-26T10:00:00.000Z',
      '2026-10-26T11:00:00.000Z',
    );
    const breakfast = event(
      'Закуска',
      '2026-10-26T06:00:00.000Z',
      '2026-10-26T07:00:00.000Z',
    );
    const birthday = event(
      'Рожден ден',
      '2026-10-25T22:00:00.000Z',
      '2026-10-26T22:00:00.000Z',
      true,
    );

    expect(
      titlesByDay(
        groupEventsByDay(
          [lunch, breakfast, birthday],
          '2026-10-26',
          '2026-10-27',
        ),
      ),
    ).toEqual([['2026-10-26', ['Рожден ден', 'Закуска', 'Обяд']]]);
  });

  it('drops events outside the range', () => {
    const before = event(
      'Вчера',
      '2026-10-24T08:00:00.000Z',
      '2026-10-24T09:00:00.000Z',
    );

    expect(
      titlesByDay(groupEventsByDay([before], '2026-10-25', '2026-10-26')),
    ).toEqual([['2026-10-25', []]]);
  });
});
