import { dateKeyInSofia, formatDataAge } from '@family/shared';
import { Link } from '@tanstack/react-router';
import type { CSSProperties, ReactNode } from 'react';
import { TopBar } from '../../components/TopBar';
import { BudgetPanel } from './BudgetPanel';
import { Core } from './Core';
import { gridTemplateRows, type SlotName } from './dashboard-slots';
import { splitDays } from './days';
import { NextDaysPanel } from './NextDaysPanel';
import type { DashboardData } from './use-dashboard-data';
import { useRemoteFocus } from './use-remote-focus';
import './KioskLayout.css';

type Loaded = Extract<DashboardData, { data: unknown }>;

interface KioskLayoutProps {
  state: Loaded;
  now: Date;
  /** kiosk: докосване води до календара и настройките. TV: само дистанционното. */
  interactive: boolean;
}

/** Ядрото на kiosk/TV: до 5 предстоящи събития днес + „+N още“. */
const CORE_MAX_EVENTS = 5;
/** „Следващите дни“: до 3 събития на ден + „+N“. */
const DAY_MAX_EVENTS = 3;

/** Слотовете, които Фаза 1 пълни; в реда на фокуса на TV: ядро → бюджет → дни. */
const FILLED = ['core', 'left-1', 'right-1'] as const satisfies SlotName[];

/** kiosk: докосване на тези слотове отваря пълния календар; ядрото носи връзките си само (Core). */
const OPENS_CALENDAR: readonly SlotName[] = ['right-1'];

/**
 * kiosk и TV: лентата горе и решетка с именувани слотове (dashboard-slots.ts).
 * TV (≥ 1600 px) в три колони около ядрото, kiosk в две: ядро | карти.
 */
export function KioskLayout({ state, now, interactive }: KioskLayoutProps) {
  const { data } = state;
  const { today, nextDays } = splitDays(data.days, dateKeyInSofia(now));
  const slotRef = useRemoteFocus(!interactive, FILLED, state.refetch);

  const slots: Record<(typeof FILLED)[number], ReactNode> = {
    core: (
      <Core
        today={today}
        now={now}
        cooking={data.cooking}
        sync={data.sync.calendar}
        showStale
        seconds
        maxEvents={CORE_MAX_EVENTS}
        showHiddenCount
        opensMenu={interactive}
        recipeTarget="cooking"
        opensCalendar={interactive}
      />
    ),
    'left-1': (
      <BudgetPanel
        budget={data.budget}
        now={now}
        sync={data.sync.budget}
        index={1}
      />
    ),
    'right-1': (
      <NextDaysPanel
        days={nextDays}
        now={now}
        sync={data.sync.calendar}
        index={2}
        maxEventsPerDay={DAY_MAX_EVENTS}
      />
    ),
  };

  return (
    <main className="kiosk">
      <TopBar now={now} sync={data.sync} />
      {state.status === 'offline' && (
        <p className="dashboard__offline" role="status">
          Няма връзка със сървъра · данни {formatDataAge(state.fetchedAt, now)}
        </p>
      )}
      <div
        className="kiosk__grid"
        style={
          {
            '--rows-wide': gridTemplateRows('wide', FILLED),
            '--rows-narrow': gridTemplateRows('narrow', FILLED),
          } as CSSProperties
        }
      >
        {FILLED.map((slot) =>
          interactive && OPENS_CALENDAR.includes(slot) ? (
            <Link
              key={slot}
              to="/calendar"
              className="kiosk__slot kiosk__slot--link"
              data-slot={slot}
              style={{ gridArea: slot }}
            >
              {slots[slot]}
            </Link>
          ) : (
            <div
              key={slot}
              ref={slotRef(slot)}
              className="kiosk__slot"
              data-slot={slot}
              style={{ gridArea: slot }}
              tabIndex={interactive ? undefined : 0}
            >
              {slots[slot]}
            </div>
          ),
        )}
      </div>
      {interactive && (
        <nav className="kiosk__corner" aria-label="Още">
          <Link to="/recipes" className="button button--quiet kiosk__recipes">
            Рецепти
          </Link>
          <Link
            to="/settings"
            className="kiosk__settings"
            aria-label="Настройки"
          >
            <SettingsIcon />
          </Link>
        </nav>
      )}
    </main>
  );
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="kiosk__settings-icon"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.4h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4z" />
    </svg>
  );
}
