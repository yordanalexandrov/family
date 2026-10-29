import type { Cooking, DayEvents, SyncStatus } from '@family/shared';
import { Link } from '@tanstack/react-router';
import { Card } from '../../components/Card';
import { formatDayLong, formatTime } from '../../lib/format';
import { syncNotes } from '../../lib/sync-notes';
import { SourceAvatars } from '../calendar/SourceAvatars';
import { Clock } from './Clock';
import { useCoreFit } from './core-fit';
import { DayRing } from './DayRing';
import { TodayCooking } from './TodayCooking';
import './Core.css';

/*
 * Ядро (GLOSSARY: core): кръглата стъклена карта с пръстена на деня по ръба.
 * Вътре отгоре надолу: целодневните като чипове (до 2 + „+N“), часовник, дата,
 * следващото събитие днес (kiosk/TV: до `maxEvents`), „Днес се готви“ и
 * надписът за остарели данни. Размерът идва отвън през `--core-size` (layout-ът
 * решава); съдържанието се смалява, докато се побере в кръга (core-fit.ts).
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
  /** kiosk, телефон: „Днес се готви“ води към менюто. */
  opensMenu?: boolean;
  /** телефон: днешна рецепта в „Днес се готви“ води към рецептата вместо към менюто. */
  opensRecipe?: boolean;
  /** kiosk: останалото ядро води към календара (връзка под съдържанието, по целия кръг). */
  opensCalendar?: boolean;
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
  opensMenu = false,
  opensRecipe = false,
  opensCalendar = false,
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
  const staleNote = showStale ? stale : undefined;
  const innerRef = useCoreFit();

  return (
    <Card
      className={opensCalendar ? 'core core--links' : 'core'}
      aria-label="Днес накратко"
    >
      <DayRing events={events} now={now} onSelect={onSelectEvent} />
      {opensCalendar && (
        <Link
          to="/calendar"
          className="core__calendar-link"
          aria-label="Календар"
        />
      )}
      <div className="core__inner" ref={innerRef}>
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
        <TodayCooking
          dinner={cooking.dinner}
          opensMenu={opensMenu}
          opensRecipe={opensRecipe}
        />
        {staleNote && <p className="core__stale">{staleNote}</p>}
      </div>
    </Card>
  );
}
