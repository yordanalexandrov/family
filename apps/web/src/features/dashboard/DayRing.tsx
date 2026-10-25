import type { CalendarEvent } from '@family/shared';
import type { CSSProperties, MouseEvent } from 'react';
import { formatTime } from '../../lib/format';
import { eventColor, useSourceAvatars } from '../calendar/SourceAvatars';
import { dayRingSegments, type RingSegment, ringAngle } from './day-ring';
import './DayRing.css';

/*
 * SVG на пръстена на деня върху ядрото. Геометрията е във viewBox 400 × 400:
 * отвън навътре деления и часове, после пистата (външна и вътрешна писта с
 * процеп помежду им), линията „сега“ и изминалата част от деня върху пистата.
 */
const SIZE = 400;
const C = SIZE / 2;
const TICK_OUTER = 197;
const HOUR_LABEL_R = 181;
const TRACK_R = 157;
const LANE_WIDTH = 11;
const LANE_GAP = 4;
const TRACK_WIDTH = LANE_WIDTH * 2 + LANE_GAP;
const LANE_R = [
  TRACK_R + (LANE_GAP + LANE_WIDTH) / 2,
  TRACK_R - (LANE_GAP + LANE_WIDTH) / 2,
] as const;
const AVATAR_R = 10;
/** Ъгълът между два аватара на една покана. */
const AVATAR_STEP = 8;

function point(radius: number, angle: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
}

function arc(radius: number, from: number, to: number): string {
  const end = Math.min(to, from + 359.99);
  const [x0, y0] = point(radius, from);
  const [x1, y1] = point(radius, end);
  const large = end - from > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function eventLabel(event: CalendarEvent): string {
  const title = event.title.trim() === '' ? 'Заето' : event.title;
  return `${formatTime(event.start)} ${title}`;
}

interface DayRingProps {
  events: CalendarEvent[];
  now: Date;
  /** Докосване на сегмент (на телефона: превърта списъка „Днес“). */
  onSelect?: (eventId: string) => void;
}

export function DayRing({ events, now, onSelect }: DayRingProps) {
  const segments = dayRingSegments(events, now);
  const byId = new Map(events.map((event) => [event.id, event]));
  const nowAngle = ringAngle(now);
  const [nowX0, nowY0] = point(TRACK_R - TRACK_WIDTH / 2 - 6, nowAngle);
  const [nowX1, nowY1] = point(TICK_OUTER + 2, nowAngle);

  return (
    <svg
      className="day-ring"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden={onSelect ? undefined : true}
    >
      <title>Пръстен на деня</title>
      <g>
        {Array.from({ length: 96 }, (_, index) => {
          const major = index % 12 === 0;
          const [x0, y0] = point(TICK_OUTER - (major ? 9 : 4), index * 3.75);
          const [x1, y1] = point(TICK_OUTER, index * 3.75);
          return (
            <line
              // biome-ignore lint/suspicious/noArrayIndexKey: неподвижни деления
              key={index}
              className={`day-ring__tick${major ? ' day-ring__tick--major' : ''}`}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
            />
          );
        })}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => {
          const [x, y] = point(HOUR_LABEL_R, hour * 15);
          return (
            <text key={hour} className="day-ring__hour" x={x} y={y}>
              {String(hour).padStart(2, '0')}
            </text>
          );
        })}
        <circle
          className="day-ring__track"
          cx={C}
          cy={C}
          r={TRACK_R}
          strokeWidth={TRACK_WIDTH}
        />
        {nowAngle > 0.5 && (
          <path
            className="day-ring__past"
            d={arc(TRACK_R, 0, nowAngle)}
            strokeWidth={TRACK_WIDTH}
          />
        )}
      </g>
      {segments.map((segment) => {
        const event = byId.get(segment.eventId);
        if (!event) {
          return null;
        }
        return (
          <Segment
            key={segment.eventId}
            segment={segment}
            event={event}
            past={Date.parse(event.end) <= now.getTime()}
            onSelect={onSelect}
          />
        );
      })}
      <g className="day-ring__now">
        <line x1={nowX0} y1={nowY0} x2={nowX1} y2={nowY1} />
        <circle cx={nowX1} cy={nowY1} r={4} />
      </g>
    </svg>
  );
}

function Segment({
  segment,
  event,
  past,
  onSelect,
}: {
  segment: RingSegment;
  event: CalendarEvent;
  past: boolean;
  onSelect?: (eventId: string) => void;
}) {
  const avatars = useSourceAvatars(segment.sources);
  const style = {
    '--segment-color': `var(--color-${eventColor(segment.sources)})`,
  } as CSSProperties;
  const radius = segment.thin ? TRACK_R : LANE_R[segment.lane];
  const body = (
    <>
      <path
        className={`day-ring__segment${segment.thin ? ' day-ring__segment--thin' : ''}`}
        d={arc(radius, segment.startAngle, segment.endAngle)}
        strokeWidth={segment.thin ? 2.5 : LANE_WIDTH}
      />
      {!segment.thin &&
        avatars.map(({ id, initial, color }, index) => {
          const [x, y] = point(
            radius,
            segment.startAngle + index * AVATAR_STEP,
          );
          return (
            <g
              key={id}
              className="day-ring__avatar"
              style={
                { '--avatar-color': `var(--color-${color})` } as CSSProperties
              }
            >
              <circle cx={x} cy={y} r={AVATAR_R} />
              <text x={x} y={y}>
                {initial}
              </text>
            </g>
          );
        })}
    </>
  );
  const label = eventLabel(event);
  const className = `day-ring__event${past ? ' day-ring__event--past' : ''}`;

  if (!onSelect) {
    return (
      <g className={className} style={style}>
        <title>{label}</title>
        {body}
      </g>
    );
  }
  function select(clickEvent: MouseEvent) {
    clickEvent.preventDefault();
    onSelect?.(event.id);
  }
  return (
    // Връзка към събитието в списъка „Днес“; без JS hash-ът върши същото.
    <a
      className={className}
      style={style}
      href={`#today-${event.id}`}
      aria-label={label}
      onClick={select}
    >
      <title>{label}</title>
      {body}
    </a>
  );
}
