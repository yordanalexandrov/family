import type { DayEvents, SyncStatus } from '@family/shared';
import type { CSSProperties } from 'react';
import { Card } from '../../components/Card';
import { DayEventList } from '../calendar/DayEventList';
import { formatDate, formatWeekday } from '../calendar/format';
import { staleNote, unconfiguredNote } from './stale';
import './NextDaysPanel.css';

interface NextDaysPanelProps {
  days: DayEvents[];
  now: Date;
  sync: SyncStatus;
  index?: number;
  /** kiosk/TV: до толкова събития на ден + „+N“. */
  maxEventsPerDay?: number;
}

/** Следващите дни компактно: ден и дата вляво, събитията вдясно. */
export function NextDaysPanel({
  days,
  now,
  sync,
  index = 3,
  maxEventsPerDay,
}: NextDaysPanelProps) {
  const unconfigured = unconfiguredNote(sync);
  return (
    <Card
      title="Следващите дни"
      aria-label="Следващите дни"
      stale={staleNote(sync, now)}
      style={{ '--card-index': index } as CSSProperties}
    >
      {unconfigured ? (
        <p className="dashboard__note">{unconfigured}</p>
      ) : (
        <ul className="next-days">
          {days.map((day) => (
            <li key={day.date} className="next-days__day">
              <h3 className="next-days__head">
                <b>{formatWeekday(day.date)}</b>
                <span>{formatDate(day.date)}</span>
              </h3>
              <DayEventList
                day={day}
                now={now}
                compact
                maxEvents={maxEventsPerDay}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
