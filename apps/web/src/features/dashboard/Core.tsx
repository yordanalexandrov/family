import type { Cooking, DayEvents, SyncStatus } from '@family/shared';
import { Card } from '../../components/Card';
import { formatDayLong, formatTime } from '../../lib/format';
import { syncNotes } from '../../lib/sync-notes';
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
  /** Свежестта на календара: без конфигурация ядрото не показва кешираните събития. */
  sync: SyncStatus;
  /** Жълтият надпис за остарели данни (kiosk, TV; на телефона го носи „Днес“ под ядрото). */
  showStale?: boolean;
  /** Часовник със секунди (kiosk, TV). */
  seconds?: boolean;
  /** Колко от предстоящите днес събития да се покажат (телефон: 1). */
  maxEvents?: number;
  /** „+N още“ под събитията, ако предстоящите са повече от `maxEvents` (kiosk, TV). */
  showHiddenCount?: boolean;
  /** Докосване на сегмент от пръстена. */
  onSelectEvent?: (eventId: string) => void;
}

export function Core({
  today,
  now,
  cooking,
  sync,
  showStale = false,
  seconds = false,
  maxEvents = 1,
  showHiddenCount = false,
  onSelectEvent,
}: CoreProps) {
  const { unconfigured, stale } = syncNotes(sync, now);
  const events = unconfigured ? [] : today.events;
  const allDay = events.filter((event) => event.allDay);
  const allUpcoming = events.filter(
    (event) => !event.allDay && Date.parse(event.start) > now.getTime(),
  );
  const upcoming = allUpcoming.slice(0, maxEvents);
  const hiddenEvents = showHiddenCount ? allUpcoming.length - maxEvents : 0;
  const hiddenChips = allDay.length - MAX_CHIPS;

  return (
    <Card
      className="core"
      aria-label="Днес накратко"
      stale={showStale ? stale : undefined}
    >
      <DayRing events={events} now={now} onSelect={onSelectEvent} />
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
        {unconfigured && <p className="core__note">{unconfigured}</p>}
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
            {hiddenEvents > 0 && (
              <li className="core__event core__event--more">
                +{hiddenEvents} още
              </li>
            )}
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
