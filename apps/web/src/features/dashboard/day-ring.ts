import {
  addDays,
  type CalendarEvent,
  type CalendarSource,
  dateKeyInSofia,
  FAMILY_TIME_ZONE,
  startOfDayInSofia,
} from '@family/shared';

/*
 * Пръстен на деня (GLOSSARY): днешните събития като дъги на 24-часов кръг.
 * 00:00 е горе (0°), посоката е по часовника, 1 час = 15°. Ъгълът следва
 * часовника в София, затова 15:00 е на 225° и в дните със смяна на времето.
 */
export interface RingSegment {
  eventId: string;
  /** Градуси от 00:00 по часовника, 0–360. */
  startAngle: number;
  endAngle: number;
  /** 0 = външната писта, 1 = вътрешната. */
  lane: 0 | 1;
  sources: CalendarSource[];
  /** Трето и следващо застъпено събитие: тънка черта без аватар. */
  thin: boolean;
}

const DAY_MINUTES = 24 * 60;
const MIN_MINUTES = 15;
const DEGREES_PER_MINUTE = 360 / DAY_MINUTES;

const clockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: FAMILY_TIME_ZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Минути от 00:00 по часовника в София (с дробна част за секундите). */
function wallMinutes(instant: Date): number {
  let minutes = 0;
  for (const { type, value } of clockFormat.formatToParts(instant)) {
    if (type === 'hour') minutes += Number(value) * 60;
    if (type === 'minute') minutes += Number(value);
    if (type === 'second') minutes += Number(value) / 60;
  }
  return minutes;
}

/** Ъгълът на `now` върху пръстена на неговия ден: линията „сега“ и изминалата част от деня. */
export function ringAngle(now: Date): number {
  return wallMinutes(now) * DEGREES_PER_MINUTE;
}

interface Span {
  event: CalendarEvent;
  start: number;
  end: number;
}

/** Частта от събитието в днешния ден, в минути от 00:00; `null`, ако не е днес. */
function spanToday(
  event: CalendarEvent,
  dayStart: number,
  dayEnd: number,
): Span | null {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  if (start >= dayEnd || end <= dayStart) {
    // Събитие с нулева дължина точно в 00:00 все пак е днес.
    if (!(start === end && start === dayStart)) {
      return null;
    }
  }
  const from = start <= dayStart ? 0 : wallMinutes(new Date(start));
  let to = end >= dayEnd ? DAY_MINUTES : wallMinutes(new Date(end));
  to = Math.max(to, from + MIN_MINUTES);
  if (to > DAY_MINUTES) {
    return { event, start: DAY_MINUTES - MIN_MINUTES, end: DAY_MINUTES };
  }
  return { event, start: from, end: to };
}

/**
 * Сегментите на пръстена за деня на `now`. Целодневните не са на него. Събитие през
 * полунощ се реже до деня; минималната дължина е 15 мин. Застъпените заемат
 * външната, после вътрешната писта; трето и следващо едновременно е `thin`.
 * Покана от няколко източника е едно събитие (api я е слял) и един сегмент.
 */
export function dayRingSegments(
  events: CalendarEvent[],
  now: Date,
): RingSegment[] {
  const today = dateKeyInSofia(now);
  const dayStart = startOfDayInSofia(today).getTime();
  const dayEnd = startOfDayInSofia(addDays(today, 1)).getTime();

  const spans = events
    .filter((event) => !event.allDay)
    .map((event) => spanToday(event, dayStart, dayEnd))
    .filter((span): span is Span => span !== null)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  // Докъде е заета всяка писта.
  const laneEnds: [number, number] = [0, 0];
  return spans.map(({ event, start, end }) => {
    let lane: 0 | 1 = 1;
    let thin = false;
    if (laneEnds[0] <= start) {
      lane = 0;
      laneEnds[0] = end;
    } else if (laneEnds[1] <= start) {
      laneEnds[1] = end;
    } else {
      thin = true;
    }
    return {
      eventId: event.id,
      startAngle: start * DEGREES_PER_MINUTE,
      endAngle: end * DEGREES_PER_MINUTE,
      lane,
      sources: event.sources,
      thin,
    };
  });
}
