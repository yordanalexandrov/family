import type { CalendarEvent, CalendarSource } from '@family/shared';
import { describe, expect, it } from 'vitest';
import { dayRingMarkers, dayRingSegments } from './day-ring';

// Сряда, 4 ноември 2026, 10:00 в София (UTC+2).
const now = new Date('2026-11-04T08:00:00Z');

const daniSource: CalendarSource = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Дани',
  ownerUserId: '11111111-1111-4111-8111-111111111111',
  colorToken: 'person-1',
  kind: 'person',
};

const poliSource: CalendarSource = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  name: 'Поли',
  ownerUserId: '22222222-2222-4222-8222-222222222222',
  colorToken: 'person-2',
  kind: 'person',
};

let counter = 0;

/** Събитие по местно време в София: `'2026-11-04 10:00'`. */
function event(
  start: string,
  end: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  counter += 1;
  return {
    id: `bbbbbbbb-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    title: `Събитие ${counter}`,
    start: sofia(start),
    end: sofia(end),
    allDay: false,
    sources: [daniSource],
    ...overrides,
  };
}

function sofia(local: string): string {
  return new Date(`${local.replace(' ', 'T')}:00+02:00`).toISOString();
}

describe('dayRingSegments', () => {
  it('00:00 е горе (0°), посоката е по часовника: 06:00–09:00 е 90°–135°', () => {
    const midnight = event('2026-11-04 00:00', '2026-11-04 01:00');
    const morning = event('2026-11-04 06:00', '2026-11-04 09:00');

    const segments = dayRingSegments([midnight, morning], now);

    expect(segments).toEqual([
      expect.objectContaining({
        eventId: midnight.id,
        startAngle: 0,
        endAngle: 15,
      }),
      expect.objectContaining({
        eventId: morning.id,
        startAngle: 90,
        endAngle: 135,
      }),
    ]);
  });

  it('застъпените събития са на две писти, третото застъпено е thin', () => {
    const first = event('2026-11-04 10:00', '2026-11-04 12:00');
    const second = event('2026-11-04 11:00', '2026-11-04 13:00');
    const third = event('2026-11-04 11:30', '2026-11-04 12:30');
    const later = event('2026-11-04 13:00', '2026-11-04 14:00');

    const segments = dayRingSegments([first, second, third, later], now);

    expect(
      segments.map(({ eventId, lane, thin }) => ({ eventId, lane, thin })),
    ).toEqual([
      { eventId: first.id, lane: 0, thin: false },
      { eventId: second.id, lane: 1, thin: false },
      { eventId: third.id, lane: 1, thin: true },
      { eventId: later.id, lane: 0, thin: false },
    ]);
  });

  it('събитие, което започва точно когато свършва предишното, е на другата писта', () => {
    const two = event('2026-11-04 14:00', '2026-11-04 15:00');
    const three = event('2026-11-04 15:00', '2026-11-04 16:00');
    const four = event('2026-11-04 16:00', '2026-11-04 17:00');

    const segments = dayRingSegments([two, three, four], now);

    expect(segments.map(({ lane, thin }) => ({ lane, thin }))).toEqual([
      { lane: 0, thin: false },
      { lane: 1, thin: false },
      { lane: 0, thin: false },
    ]);
  });

  it('при допиращи се събития на двете писти следващото не е thin', () => {
    const outer = event('2026-11-04 10:00', '2026-11-04 11:00');
    const inner = event('2026-11-04 10:30', '2026-11-04 11:00');
    const next = event('2026-11-04 11:00', '2026-11-04 12:00');

    const segments = dayRingSegments([outer, inner, next], now);

    expect(segments.map(({ lane, thin }) => ({ lane, thin }))).toEqual([
      { lane: 0, thin: false },
      { lane: 1, thin: false },
      { lane: 0, thin: false },
    ]);
  });

  it('събитие 23:00–01:00 се реже до 24:00', () => {
    const late = event('2026-11-04 23:00', '2026-11-05 01:00');

    const [segment] = dayRingSegments([late], now);

    expect(segment).toMatchObject({ startAngle: 345, endAngle: 360 });
  });

  it('събитие, започнало вчера, е от 00:00', () => {
    const overnight = event('2026-11-03 22:00', '2026-11-04 02:00');

    const [segment] = dayRingSegments([overnight], now);

    expect(segment).toMatchObject({ startAngle: 0, endAngle: 30 });
  });

  it('5-минутно събитие става 15 минути', () => {
    const short = event('2026-11-04 14:00', '2026-11-04 14:05');

    const [segment] = dayRingSegments([short], now);

    expect(segment).toMatchObject({ startAngle: 210, endAngle: 213.75 });
  });

  it('покана от два източника е един сегмент с двата източника', () => {
    const invitation = event('2026-11-04 18:30', '2026-11-04 19:30', {
      sources: [daniSource, poliSource],
    });

    const segments = dayRingSegments([invitation], now);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      eventId: invitation.id,
      sources: [daniSource, poliSource],
      lane: 0,
      thin: false,
    });
  });

  it('целодневните събития не са на пръстена', () => {
    const allDay = event('2026-11-04 00:00', '2026-11-05 00:00', {
      allDay: true,
    });
    const timed = event('2026-11-04 09:00', '2026-11-04 10:00');

    const segments = dayRingSegments([allDay, timed], now);

    expect(segments.map((segment) => segment.eventId)).toEqual([timed.id]);
  });

  it('събитие от друг ден не е на пръстена', () => {
    const tomorrow = event('2026-11-05 09:00', '2026-11-05 10:00');

    expect(dayRingSegments([tomorrow], now)).toEqual([]);
  });
});

describe('dayRingMarkers', () => {
  it('10:00, 11:00 и 11:15 на един човек са един маркер с брой 3', () => {
    const ten = event('2026-11-04 10:00', '2026-11-04 11:00');
    const eleven = event('2026-11-04 11:00', '2026-11-04 12:00');
    const quarter = event('2026-11-04 11:15', '2026-11-04 11:45');

    const markers = dayRingMarkers([ten, eleven, quarter], now);

    expect(markers).toEqual([
      {
        source: daniSource,
        angle: 150,
        count: 3,
        eventIds: [ten.id, eleven.id, quarter.id],
        level: 0,
      },
    ]);
  });

  it('две събития на различни хора в един час са два маркера на различен радиус', () => {
    const dani = event('2026-11-04 15:00', '2026-11-04 16:00');
    const poli = event('2026-11-04 15:30', '2026-11-04 16:30', {
      sources: [poliSource],
    });

    const markers = dayRingMarkers([dani, poli], now);

    expect(
      markers.map(({ source, angle, level }) => ({
        sourceId: source.id,
        angle,
        level,
      })),
    ).toEqual([
      { sourceId: daniSource.id, angle: 225, level: 0 },
      { sourceId: poliSource.id, angle: 232.5, level: 1 },
    ]);
  });
});
