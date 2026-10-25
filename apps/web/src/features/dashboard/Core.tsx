import type { Cooking, DayEvents } from '@family/shared';
import { Card } from '../../components/Card';
import { formatDayLong, formatTime } from '../calendar/format';
import { SourceAvatars } from '../calendar/SourceAvatars';
import { Clock } from './Clock';
import { DayRing } from './DayRing';
import './Core.css';

/*
 * Ядро (GLOSSARY: core): кръглата стъклена карта с пръстена на деня по ръба.
 * Вътре отгоре надолу: целодневните като чипове (до 2 + „+N“), часовник, дата,
 * следващото събитие днес (kiosk/TV: до `maxEvents`), „Днес се готви“.
 * Размерът идва отвън през `--core-size` (layout-ът решава).
 */
const MAX_CHIPS = 2;

interface CoreProps {
  today: DayEvents;
  now: Date;
  cooking: Cooking;
  /** Часовник със секунди (kiosk, TV). */
  seconds?: boolean;
  /** Колко от предстоящите днес събития да се покажат (телефон: 1). */
  maxEvents?: number;
  /** Докосване на сегмент от пръстена. */
  onSelectEvent?: (eventId: string) => void;
}

export function Core({
  today,
  now,
  cooking,
  seconds = false,
  maxEvents = 1,
  onSelectEvent,
}: CoreProps) {
  const allDay = today.events.filter((event) => event.allDay);
  const upcoming = today.events
    .filter((event) => !event.allDay && Date.parse(event.start) > now.getTime())
    .slice(0, maxEvents);
  const hiddenChips = allDay.length - MAX_CHIPS;

  return (
    <Card className="core" aria-label="Днес накратко">
      <DayRing events={today.events} now={now} onSelect={onSelectEvent} />
      <div className="core__inner">
        {allDay.length > 0 && (
          <ul className="core__chips">
            {allDay.slice(0, MAX_CHIPS).map((event) => (
              <li key={event.id} className="core__chip">
                {event.title.trim() === '' ? 'Заето' : event.title}
              </li>
            ))}
            {hiddenChips > 0 && (
              <li className="core__chip core__chip--more">+{hiddenChips}</li>
            )}
          </ul>
        )}
        <Clock seconds={seconds} />
        <p className="core__date">{formatDayLong(now)}</p>
        {upcoming.length > 0 && (
          <ul className="core__events">
            {upcoming.map((event) => (
              <li key={event.id} className="core__event">
                <SourceAvatars sources={event.sources} />
                <span className="core__event-time">
                  {formatTime(event.start)}
                </span>
                <span className="core__event-title">
                  {event.title.trim() === '' ? 'Заето' : event.title}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="core__cooking">
          <small>Днес се готви</small>
          <b>{cooking.dinner?.title ?? '—'}</b>
        </div>
      </div>
    </Card>
  );
}
