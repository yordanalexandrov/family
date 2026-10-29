import {
  type BudgetSnapshot,
  dailyPace,
  dateKeyInSofia,
  daysBetween,
  isOverBudget,
  type SyncStatus,
} from '@family/shared';
import type { CSSProperties } from 'react';
import { Card } from '../../components/Card';
import { formatDate, formatMoney } from '../../lib/format';
import { syncNotes } from '../../lib/sync-notes';
import { SyncButton } from './SyncButton';
import './BudgetPanel.css';

interface BudgetPanelProps {
  budget: BudgetSnapshot | null;
  now: Date;
  sync: SyncStatus;
  index?: number;
  /** телефон, браузър: иконата за обновяване на бюджета. */
  refreshable?: boolean;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Докъде в периода е краят на днешния ден, 0–1. */
function dayFraction(budget: BudgetSnapshot, today: string): number {
  const days = daysBetween(budget.periodStart, budget.periodEnd) + 1;
  const passed = daysBetween(budget.periodStart, today) + 1;
  return clamp(passed / days);
}

/** Колко дни остават от периода, днешният включително: „3 дни“, „1 ден“. */
function formatDaysLeft(budget: BudgetSnapshot, today: string): string {
  const days = Math.max(0, daysBetween(today, budget.periodEnd) + 1);
  return days === 1 ? '1 ден' : `${days} дни`;
}

/**
 * Остатъкът от месечния бюджет на Wallet: числото едро, лента похарчено/лимит с
 * маркер „днес“, похарчени и темпо до края. Превишен бюджет казва едро с колко е
 * превишен (без „остават“), оцветява лентата и вместо темпото казва колко дни остават.
 */
export function BudgetPanel({
  budget,
  now,
  sync,
  index = 2,
  refreshable = false,
}: BudgetPanelProps) {
  const { unconfigured, stale } = syncNotes(sync, now);
  const style = { '--card-index': index } as CSSProperties;
  const action = refreshable ? <SyncButton source="budget" /> : undefined;

  if (unconfigured) {
    return (
      <Card title="Бюджет" aria-label="Бюджет" style={style}>
        <p className="budget__amount">—</p>
        <p className="dashboard__note">{unconfigured}</p>
      </Card>
    );
  }

  if (budget === null) {
    // Без данни: един ред, който казва и защо (A-16), вместо „—“ и два надписа.
    return (
      <Card title="Бюджет" aria-label="Бюджет" action={action} style={style}>
        <p className={stale ? 'card__stale' : 'dashboard__note'}>
          {stale ?? 'Още няма данни от Wallet'}
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
      aside={over ? undefined : `остават до ${formatDate(budget.periodEnd)}`}
      action={action}
      stale={stale}
      style={style}
    >
      <div className={`budget__top${over ? ' budget__top--over' : ''}`}>
        {over ? (
          <p className="budget__amount budget__amount--danger budget__amount--over">
            превишен с {money(-budget.remaining)}
          </p>
        ) : (
          <p className="budget__amount">{money(budget.remaining)}</p>
        )}
        <div className="budget__side">
          <span>
            похарчени <b>{money(budget.spent)}</b> от {money(budget.limit)}
          </span>
          {over ? (
            <span>до края на месеца: {formatDaysLeft(budget, today)}</span>
          ) : (
            <span>
              ~<b>{money(dailyPace(budget, today))}/ден</b> до края
            </span>
          )}
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
