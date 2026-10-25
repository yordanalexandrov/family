import { formatAge } from '@family/shared';
import { type DeviceMode, useDeviceMode } from '../../app/device-mode';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { TopBar } from '../../components/TopBar';
import { BudgetPanel } from './BudgetPanel';
import { Core } from './Core';
import { NextDaysPanel } from './NextDaysPanel';
import { TodayList, todayItemId } from './TodayList';
import { type DashboardData, useDashboardData } from './use-dashboard-data';
import { useNow } from './use-now';
import './DashboardScreen.css';

/** Минутата стига за пръстена и „преди N мин“; часовникът си има свой таймер. */
const NOW_INTERVAL_MS = 30_000;

/**
 * Дашбордът избира layout по режима на устройството. kiosk и TV получават
 * своите layout-и в Дашборд 5; дотогава показват телефонния, разтегнат на ширина.
 */
export function DashboardScreen() {
  const { mode } = useDeviceMode();
  const state = useDashboardData();
  const now = useNow(NOW_INTERVAL_MS);

  if (state.status === 'pending') {
    return (
      <main className="screen">
        <Spinner />
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="screen">
        <ErrorBox error={state.error} onRetry={state.retry} />
      </main>
    );
  }
  return <PhoneLayout state={state} now={now} mode={mode ?? 'phone'} />;
}

type Loaded = Extract<DashboardData, { data: unknown }>;

function selectTodayEvent(eventId: string) {
  const item = document.getElementById(todayItemId(eventId));
  item?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Телефонът: лента → ядро → днешните събития → бюджет → следващите дни. */
function PhoneLayout({
  state,
  now,
  mode,
}: {
  state: Loaded;
  now: Date;
  mode: DeviceMode;
}) {
  const { data } = state;
  const [today, ...nextDays] = data.days;
  if (!today) {
    return null;
  }
  return (
    <main className={`dashboard${mode === 'phone' ? '' : ' dashboard--wide'}`}>
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
        onSelectEvent={mode === 'phone' ? selectTodayEvent : undefined}
      />
      <TodayList today={today} now={now} sync={data.sync.calendar} />
      <BudgetPanel budget={data.budget} now={now} sync={data.sync.budget} />
      <NextDaysPanel days={nextDays} now={now} sync={data.sync.calendar} />
    </main>
  );
}
