import { describe, expect, it } from 'vitest';
import type { CalendarSource } from '../schemas/calendar.js';
import { type CalendarEventRow, dedupeEvents } from './dedupe.js';

const dani: CalendarSource = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Дани',
  ownerUserId: '11111111-1111-4111-8111-111111111111',
  colorToken: 'person-1',
  kind: 'person',
};

const poli: CalendarSource = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Поли',
  ownerUserId: '22222222-2222-4222-8222-222222222222',
  colorToken: 'person-2',
  kind: 'person',
};

let nextId = 0;
function row(overrides: Partial<CalendarEventRow>): CalendarEventRow {
  nextId += 1;
  return {
    id: `eeeeeeee-eeee-4eee-8eee-${String(nextId).padStart(12, '0')}`,
    icalUid: null,
    originalStart: null,
    title: 'Събитие',
    start: '2026-10-26T08:00:00.000Z',
    end: '2026-10-26T09:00:00.000Z',
    allDay: false,
    location: null,
    htmlLink: null,
    source: dani,
    ...overrides,
  };
}

describe('dedupeEvents', () => {
  it('merges an invitation seen in two calendars into one event with both sources', () => {
    const inDani = row({ icalUid: 'dinner@google.com', title: 'Вечеря' });
    const inPoli = row({
      icalUid: 'dinner@google.com',
      title: 'Вечеря',
      source: poli,
    });

    const events = dedupeEvents([inDani, inPoli]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: inDani.id, title: 'Вечеря' });
    expect(events[0]?.sources).toEqual([dani, poli]);
  });

  it('keeps two instances of a series apart (different originalStart)', () => {
    const monday = row({
      icalUid: 'swim@google.com',
      originalStart: '2026-10-26T15:00:00.000Z',
      start: '2026-10-26T15:00:00.000Z',
    });
    const nextMonday = row({
      icalUid: 'swim@google.com',
      originalStart: '2026-11-02T16:00:00.000Z',
      start: '2026-11-02T16:00:00.000Z',
    });

    expect(dedupeEvents([monday, nextMonday])).toHaveLength(2);
  });

  it('merges the same instance of a series seen in two calendars', () => {
    const originalStart = '2026-10-26T15:00:00.000Z';
    const events = dedupeEvents([
      row({ icalUid: 'swim@google.com', originalStart }),
      row({ icalUid: 'swim@google.com', originalStart, source: poli }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.sources).toEqual([dani, poli]);
  });

  it('never merges events without an iCalUID, even when they look alike', () => {
    expect(
      dedupeEvents([
        row({ title: 'Обяд' }),
        row({ title: 'Обяд', source: poli }),
      ]),
    ).toHaveLength(2);
  });

  it('orders the result by start', () => {
    const late = row({ title: 'Късно', start: '2026-10-26T18:00:00.000Z' });
    const early = row({ title: 'Рано', start: '2026-10-26T06:00:00.000Z' });

    expect(dedupeEvents([late, early]).map((event) => event.title)).toEqual([
      'Рано',
      'Късно',
    ]);
  });

  it('returns API events without the raw-row fields', () => {
    const [event] = dedupeEvents([
      row({
        icalUid: 'x@google.com',
        originalStart: '2026-10-26T08:00:00.000Z',
      }),
    ]);

    expect(Object.keys(event ?? {}).sort()).toEqual([
      'allDay',
      'end',
      'htmlLink',
      'id',
      'location',
      'sources',
      'start',
      'title',
    ]);
  });
});
