import type { DayEvents, SyncStatus } from '@family/shared';
import type { CSSProperties } from 'react';
import { Card } from '../../components/Card';
import { formatDate, formatWeekday } from '../../lib/format';
import { syncNotes } from '../../lib/sync-notes';
import { DayEventList } from '../calendar/DayEventList';
import './NextDaysPanel.css';

interface NextDaysPanelProps {
  days: DayEvents[];
  now: Date;
  sync: SyncStatus;
  index?: number;
  /** kiosk/TV: до толкова събития на ден + „+N“. */
  maxEventsPerDay?: number;
}

/** Следващите дни компактно: денят е заглавен ред („ЧТ 29 октомври“), събитията под него са на цялата ширина. */
export function NextDaysPanel({
  days,
  now,
  sync,
  index = 3,
  maxEventsPerDay,
}: NextDaysPanelProps) {
  // Остарелите данни на календара ги казва ядрото или „Днес“, не и тази карта.
  const { unconfigured } = syncNotes(sync, now);
  return (
    <Card
      title="Следващите дни"
      aria-label="Следващите дни"
      style={{ '--card-index': index } as CSSProperties}
    >
      {unconfigured ? (
        <p className="dashboard__note">{unconfigured}</p>
      ) : (
        <ul className="next-days">
          {days.map((day) => (
            <li key={day.date} className="next-days__day">
              <h3 className="next-days__head">
                <b>{formatWeekday(day.date)}</b>{' '}
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
