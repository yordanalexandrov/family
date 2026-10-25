import type { DayEvents, SyncStatus } from '@family/shared';
import type { CSSProperties } from 'react';
import { Card } from '../../components/Card';
import { syncNotes } from '../../lib/sync-notes';
import { DayEventList } from '../calendar/DayEventList';

/** id на реда в „Днес“; пръстенът превърта до него. */
export function todayItemId(eventId: string): string {
  return `today-${eventId}`;
}

interface TodayListProps {
  today: DayEvents;
  now: Date;
  sync: SyncStatus;
  index?: number;
}

export function TodayList({ today, now, sync, index = 1 }: TodayListProps) {
  const { unconfigured, stale } = syncNotes(sync, now);
  return (
    <Card
      title="Днес"
      aria-label="Днес"
      stale={stale}
      style={{ '--card-index': index } as CSSProperties}
    >
      {unconfigured ? (
        <p className="dashboard__note">{unconfigured}</p>
      ) : (
        <DayEventList day={today} now={now} itemId={todayItemId} />
      )}
    </Card>
  );
}
