import { dateKeyInSofia, formatAge } from '@family/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ApiError } from '../../api/client';
import { queryKeys } from '../../api/queries';
import { useDeviceMode } from '../../app/device-mode';
import { ErrorBox } from '../../components/ErrorBox';
import { SessionExpired } from '../../components/SessionExpired';
import { Spinner } from '../../components/Spinner';
import { TopBar } from '../../components/TopBar';
import { BudgetPanel } from './BudgetPanel';
import { Core } from './Core';
import { splitDays } from './days';
import { KioskLayout } from './KioskLayout';
import { NextDaysPanel } from './NextDaysPanel';
import { TodayList, todayItemId } from './TodayList';
import { type DashboardData, useDashboardData } from './use-dashboard-data';
import { useNow } from './use-now';
import './DashboardScreen.css';

/**
 * Минутата стига за пръстена и „преди N мин“ (и за смяната на датата); часовникът
 * си има свой таймер.
 */
const NOW_INTERVAL_MS = 30_000;

/** Дашбордът избира layout по режима на устройството: телефонен или kiosk/TV. */
export function DashboardScreen() {
  const { mode } = useDeviceMode();
  const state = useDashboardData();
  const now = useNow(NOW_INTERVAL_MS);
  useRefetchOnNewDay(now);

  if (state.status === 'pending') {
    return (
      <main className="screen">
        <Spinner />
      </main>
    );
  }
  const wall = mode === 'kiosk' || mode === 'tv';
  if (state.status === 'error' && wall && isSessionExpired(state.error)) {
    return <SessionExpired tv={mode === 'tv'} />;
  }
  if (state.status === 'error') {
    return (
      <main className="screen">
        <ErrorBox error={state.error} onRetry={state.retry} />
      </main>
    );
  }
  if (wall) {
    return (
      <KioskLayout state={state} now={now} interactive={mode === 'kiosk'} />
    );
  }
  return <PhoneLayout state={state} now={now} />;
}

/** При смяна на датата по часовника на устройството данните се зареждат веднага. */
function useRefetchOnNewDay(now: Date) {
  const queryClient = useQueryClient();
  const day = dateKeyInSofia(now);
  const previous = useRef(day);
  useEffect(() => {
    if (previous.current !== day) {
      previous.current = day;
      void queryClient.refetchQueries({ queryKey: queryKeys.dashboard });
    }
  }, [day, queryClient]);
}

function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.isSessionExpired();
}

type Loaded = Extract<DashboardData, { data: unknown }>;

function selectTodayEvent(eventId: string) {
  const item = document.getElementById(todayItemId(eventId));
  item?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Телефонът: лента → ядро → днешните събития → бюджет → следващите дни. */
function PhoneLayout({ state, now }: { state: Loaded; now: Date }) {
  const { data } = state;
  const { today, nextDays } = splitDays(data.days, dateKeyInSofia(now));
  return (
    <main className="dashboard">
      <TopBar now={now} sync={data.sync} />
      {state.status === 'offline' && (
        <p className="dashboard__offline" role="status">
          Няма връзка със сървъра · данни от {formatAge(state.fetchedAt, now)}
        </p>
      )}
      <Core
        today={today}
        now={now}
        cooking={data.cooking}
        sync={data.sync.calendar}
        onSelectEvent={selectTodayEvent}
        opensMenu
      />
      <TodayList today={today} now={now} sync={data.sync.calendar} />
      <BudgetPanel budget={data.budget} now={now} sync={data.sync.budget} />
      <NextDaysPanel days={nextDays} now={now} sync={data.sync.calendar} />
    </main>
  );
}
