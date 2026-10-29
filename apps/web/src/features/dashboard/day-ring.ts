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

/** Днешните събития с час, подредени по начало (по-дългото първо). */
function spansToday(events: CalendarEvent[], now: Date): Span[] {
  const today = dateKeyInSofia(now);
  const dayStart = startOfDayInSofia(today).getTime();
  const dayEnd = startOfDayInSofia(addDays(today, 1)).getTime();
  return events
    .filter((event) => !event.allDay)
    .map((event) => spanToday(event, dayStart, dayEnd))
    .filter((span): span is Span => span !== null)
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Сегментите на пръстена за деня на `now`. Целодневните не са на него. Събитие през
 * полунощ се реже до деня; минималната дължина е 15 мин. Застъпените заемат
 * външната, после вътрешната писта; трето и следващо едновременно е `thin`.
 * Събитие, което започва точно в края на предишното, е на другата писта, ако е свободна.
 * Покана от няколко източника е едно събитие (api я е слял) и един сегмент.
 */
export function dayRingSegments(
  events: CalendarEvent[],
  now: Date,
): RingSegment[] {
  const spans = spansToday(events, now);

  // Докъде е заета всяка писта.
  const laneEnds: [number, number] = [0, 0];
  return spans.map(({ event, start, end }) => {
    // Първо писта, свободна преди началото: заоблените краища на две
    // допиращи се дъги на една писта се застъпват и те изглеждат като една.
    const lanes: (0 | 1)[] = [0, 1];
    const lane =
      lanes.find((index) => laneEnds[index] < start) ??
      lanes.find((index) => laneEnds[index] <= start);
    const thin = lane === undefined;
    if (lane !== undefined) {
      laneEnds[lane] = end;
    }
    return {
      eventId: event.id,
      startAngle: start * DEGREES_PER_MINUTE,
      endAngle: end * DEGREES_PER_MINUTE,
      lane: lane ?? 1,
      sources: event.sources,
      thin,
    };
  });
}

/**
 * Маркер на пръстена: аватарът на един източник (човек или семейството) при
 * началото на едно или няколко негови събития.
 */
export interface RingMarker {
  source: CalendarSource;
  /** Ъгълът на първото събитие в маркера. */
  angle: number;
  /** Колко събития събира („Д ×3“). */
  count: number;
  eventIds: string[];
  /** Писта по радиус: 0 = външната; маркерите на различни хора на едно място са на различни писти. */
  level: number;
}

/**
 * Прагът по ъгъл: събитията на един източник, започнали по-малко от 80 мин
 * след първото в маркера, влизат в него. 20° е повече от ширината на маркер
 * с брой, затова съседните маркери на един човек не се застъпват.
 */
const MARKER_MERGE_DEGREES = 20;

/**
 * Маркерите на пръстена за деня на `now`: по един за всеки източник на
 * събитието; близките събития на един източник се събират в един маркер, а
 * маркерите на различни източници на едно място се разминават по радиус.
 */
export function dayRingMarkers(
  events: CalendarEvent[],
  now: Date,
): RingMarker[] {
  const markers: RingMarker[] = [];
  const open = new Map<string, RingMarker>();
  for (const { event, start } of spansToday(events, now)) {
    const angle = start * DEGREES_PER_MINUTE;
    for (const source of event.sources) {
      const current = open.get(source.id);
      if (current && angle - current.angle < MARKER_MERGE_DEGREES) {
        current.count += 1;
        current.eventIds.push(event.id);
        continue;
      }
      // Най-външната писта, която не е заета от близък маркер на друг източник.
      const taken = new Set(
        markers
          .filter((other) => angle - other.angle < MARKER_MERGE_DEGREES)
          .map((other) => other.level),
      );
      let level = 0;
      while (taken.has(level)) {
        level += 1;
      }
      const marker = {
        source,
        angle,
        count: 1,
        eventIds: [event.id],
        level,
      };
      open.set(source.id, marker);
      markers.push(marker);
    }
  }
  return markers;
}
