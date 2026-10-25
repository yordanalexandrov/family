import {
  type BudgetSnapshot,
  dailyPace,
  dateKeyInSofia,
  isOverBudget,
  type SyncStatus,
  utcMidnightOf,
} from '@family/shared';
import type { CSSProperties } from 'react';
import { Card } from '../../components/Card';
import { formatDate, formatMoney } from '../calendar/format';
import { staleNote, unconfiguredNote } from './stale';
import './BudgetPanel.css';

interface BudgetPanelProps {
  budget: BudgetSnapshot | null;
  now: Date;
  sync: SyncStatus;
  index?: number;
}

const DAY_MS = 86_400_000;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Докъде в периода е краят на днешния ден, 0–1. */
function dayFraction(budget: BudgetSnapshot, today: string): number {
  const start = utcMidnightOf(budget.periodStart);
  const days = (utcMidnightOf(budget.periodEnd) - start) / DAY_MS + 1;
  const passed = (utcMidnightOf(today) - start) / DAY_MS + 1;
  return clamp(passed / days);
}

/**
 * Остатъкът от месечния бюджет на Wallet: числото едро, лента похарчено/лимит с
 * маркер „днес“, похарчени и темпо до края. Превишен бюджет оцветява само числото и лентата.
 */
export function BudgetPanel({
  budget,
  now,
  sync,
  index = 2,
}: BudgetPanelProps) {
  const unconfigured = unconfiguredNote(sync);
  const style = { '--card-index': index } as CSSProperties;

  if (unconfigured || budget === null) {
    return (
      <Card
        title="Бюджет"
        aria-label="Бюджет"
        stale={staleNote(sync, now)}
        style={style}
      >
        <p className="budget__amount">—</p>
        <p className="dashboard__note">
          {unconfigured ?? 'няма данни от Wallet'}
        </p>
      </Card>
    );
  }

  const today = dateKeyInSofia(now);
  const over = isOverBudget(budget);
  const money = (amount: number) => formatMoney(amount, budget.currency);
  const spentShare = budget.limit > 0 ? clamp(budget.spent / budget.limit) : 1;
  const barStyle = {
    '--budget-spent': `${(spentShare * 100).toFixed(1)}%`,
    '--budget-today': `${(dayFraction(budget, today) * 100).toFixed(1)}%`,
  } as CSSProperties;

  return (
    <Card
      title="Бюджет"
      aria-label="Бюджет"
      aside={`остават до ${formatDate(budget.periodEnd)}`}
      stale={staleNote(sync, now)}
      style={style}
    >
      <div className="budget__top">
        <p className={`budget__amount${over ? ' budget__amount--danger' : ''}`}>
          {money(budget.remaining)}
        </p>
        <div className="budget__side">
          <span>
            похарчени <b>{money(budget.spent)}</b> от {money(budget.limit)}
          </span>
          <span>
            ~<b>{money(dailyPace(budget, today))}/ден</b> до края
          </span>
        </div>
      </div>
      <div
        className={`budget__bar${over ? ' budget__bar--danger' : ''}`}
        style={barStyle}
      >
        <meter
          className="visually-hidden"
          aria-label="Похарчено от лимита"
          min={0}
          max={budget.limit}
          value={budget.spent}
        />
        <span className="budget__fill" aria-hidden="true" />
        <span className="budget__today" aria-hidden="true">
          <em>днес</em>
        </span>
      </div>
    </Card>
  );
}
