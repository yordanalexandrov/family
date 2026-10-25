import {
  addDays,
  CALENDAR_MAX_DAYS,
  dateKeyInSofia,
  type SyncRunResult,
} from '@family/shared';
import { type CSSProperties, useCallback, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  useCalendarEvents,
  useDashboard,
  useSyncCalendar,
} from '../../api/queries';
import { useDeviceMode } from '../../app/device-mode';
import { BackLink } from '../../components/BackLink';
import { Card } from '../../components/Card';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { Toast } from '../../components/Toast';
import { staleNote, unconfiguredNote } from '../dashboard/stale';
import { useNow } from '../dashboard/use-now';
import { DayEventList } from './DayEventList';
import { formatDayLong } from './format';
import './CalendarScreen.css';

const SYNC_MESSAGES: Record<SyncRunResult['status'], string> = {
  ok: 'Календарът е обновен',
  running: 'Синхронизацията вече тече',
  failed: 'Google Calendar не отговаря',
  unconfigured: 'Google Calendar не е конфигуриран',
};

function syncMessage(result: SyncRunResult): string {
  const message = SYNC_MESSAGES[result.status];
  return result.status === 'failed' && result.error
    ? `${message}: ${result.error}`
    : message;
}

/** Пълният календар: 14 дни по дни, по общите правила на календара. kiosk: едри редове и „Назад“. */
export function CalendarScreen() {
  const now = useNow(30_000);
  const today = dateKeyInSofia(now);
  const days = useCalendarEvents(today, addDays(today, CALENDAR_MAX_DAYS));
  // Свежестта на календара идва с дашборда (обикновено вече е в кеша на заявките).
  const sync = useDashboard().data?.sync.calendar;
  const { mode } = useDeviceMode();
  const syncCalendar = useSyncCalendar();
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  function refresh() {
    syncCalendar.mutate(undefined, {
      onSuccess: (result) => setToast(syncMessage(result)),
      onError: (error) =>
        setToast(
          error instanceof ApiError ? error.message : 'Няма връзка със сървъра',
        ),
    });
  }

  const note = sync && (unconfiguredNote(sync) ?? staleNote(sync, now));

  return (
    <main className={`calendar${mode === 'kiosk' ? ' calendar--kiosk' : ''}`}>
      <header className="calendar__header">
        {mode === 'kiosk' && <BackLink />}
        <h1 className="calendar__title">Календар</h1>
        {mode === 'phone' && (
          <button
            type="button"
            className="button"
            onClick={refresh}
            disabled={syncCalendar.isPending}
          >
            {syncCalendar.isPending ? 'Обновява…' : 'Обнови'}
          </button>
        )}
      </header>
      {note && <p className="calendar__note">{note}</p>}
      {days.isPending ? (
        <Spinner />
      ) : days.isError ? (
        <ErrorBox error={days.error} onRetry={() => void days.refetch()} />
      ) : (
        days.data.map((day, index) => (
          <Card
            key={day.date}
            title={formatDayLong(day.date)}
            aside={index === 0 ? 'днес' : index === 1 ? 'утре' : undefined}
            aria-label={formatDayLong(day.date)}
            style={{ '--card-index': Math.min(index, 6) } as CSSProperties}
          >
            <DayEventList day={day} now={now} />
          </Card>
        ))
      )}
      <Toast message={toast} onDone={hideToast} />
    </main>
  );
}
