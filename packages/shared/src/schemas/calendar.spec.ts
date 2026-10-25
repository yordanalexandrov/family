import { describe, expect, it } from 'vitest';
import {
  calendarEventSchema,
  calendarEventsResponseSchema,
} from './calendar.js';

const dani = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Дани',
  ownerUserId: '11111111-1111-4111-8111-111111111111',
  colorToken: 'person-1',
  kind: 'person',
};

const family = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Семеен',
  ownerUserId: null,
  colorToken: 'family',
  kind: 'family',
};

const dentist = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  title: 'Зъболекар',
  start: '2026-10-26T08:00:00.000Z',
  end: '2026-10-26T09:00:00.000Z',
  allDay: false,
  location: null,
  htmlLink: 'https://www.google.com/calendar/event?eid=abc',
  sources: [dani, family],
};

describe('calendarEventSchema', () => {
  it('accepts an event that came from two calendar sources', () => {
    expect(calendarEventSchema.parse(dentist)).toEqual(dentist);
  });

  it('accepts an event without location and link', () => {
    const { location: _l, htmlLink: _h, ...bare } = dentist;
    expect(calendarEventSchema.safeParse(bare).success).toBe(true);
  });

  it('rejects a source colour that is not one of the three calendar tokens', () => {
    const result = calendarEventSchema.safeParse({
      ...dentist,
      sources: [{ ...dani, colorToken: '#d9480f' }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'sources.0.colorToken',
    ]);
  });

  it('rejects a start that is not an ISO date-time', () => {
    expect(
      calendarEventSchema.safeParse({ ...dentist, start: '26.10.2026 11:00' })
        .success,
    ).toBe(false);
  });
});

describe('calendarEventsResponseSchema', () => {
  it('accepts days keyed by YYYY-MM-DD', () => {
    const response = {
      from: '2026-10-25',
      to: '2026-11-08',
      days: [
        { date: '2026-10-25', events: [] },
        { date: '2026-10-26', events: [dentist] },
      ],
    };

    expect(calendarEventsResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects a day key with a time in it', () => {
    expect(
      calendarEventsResponseSchema.safeParse({
        from: '2026-10-25',
        to: '2026-11-08',
        days: [{ date: '2026-10-25T00:00:00Z', events: [] }],
      }).success,
    ).toBe(false);
  });
});
