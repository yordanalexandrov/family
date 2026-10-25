import {
  type CalendarEvent,
  type DayEvents,
  dateKeyInSofia,
  startOfDayInSofia,
} from '@family/shared';
import { formatTime } from './format';
import { SourceAvatars } from './SourceAvatars';
import './DayEventList.css';

/*
 * Общите правила на календара (дашборд, „Днес“, „Следващите дни“, екранът „Календар“):
 * целодневните първо (api ги подрежда), час „18:30“, многодневните във всеки ден с
 * „продължава“, днешните минали приглушени, следващото предстоящо подчертано,
 * аватар за всеки източник, „Заето“ при празно заглавие, „Нищо планирано“ за празен ден.
 */
interface DayEventListProps {
  day: DayEvents;
  now: Date;
  /** id на елемента за всяко събитие, за да може пръстенът да превърти до него. */
  itemId?: (eventId: string) => string;
  compact?: boolean;
}

type EventState = 'past' | 'next' | undefined;

function whenLabel(event: CalendarEvent, dayStart: Date): string {
  const startedBefore = Date.parse(event.start) < dayStart.getTime();
  if (event.allDay) {
    return startedBefore ? 'продължава' : 'цял ден';
  }
  return startedBefore ? 'продължава' : formatTime(event.start);
}

function eventStates(day: DayEvents, now: Date): Map<string, EventState> {
  const states = new Map<string, EventState>();
  if (dateKeyInSofia(now) !== day.date) {
    return states;
  }
  const nowMs = now.getTime();
  let nextFound = false;
  for (const event of day.events) {
    if (event.allDay) {
      continue;
    }
    if (Date.parse(event.end) <= nowMs) {
      states.set(event.id, 'past');
    } else if (!nextFound && Date.parse(event.start) > nowMs) {
      states.set(event.id, 'next');
      nextFound = true;
    }
  }
  return states;
}

export function DayEventList({
  day,
  now,
  itemId,
  compact = false,
}: DayEventListProps) {
  if (day.events.length === 0) {
    return <p className="day-events__empty">Нищо планирано</p>;
  }
  const dayStart = startOfDayInSofia(day.date);
  const states = eventStates(day, now);
  return (
    <ul className={`day-events${compact ? ' day-events--compact' : ''}`}>
      {day.events.map((event) => {
        const state = states.get(event.id);
        return (
          <li
            key={event.id}
            id={itemId?.(event.id)}
            className="day-events__item"
            data-state={state}
            aria-current={state === 'next' ? 'time' : undefined}
          >
            <span className="day-events__when">
              {whenLabel(event, dayStart)}
            </span>
            <SourceAvatars sources={event.sources} />
            <span className="day-events__title">
              {event.title.trim() === '' ? 'Заето' : event.title}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
