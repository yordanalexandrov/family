import {
  AISLES,
  type Aisle,
  addDays,
  type DateKey,
  dateKeyInSofia,
  formatAge,
  type MealPlan,
  mealsToAgree,
  type ShoppingItem,
  type ShoppingList,
  type User,
  weekStartOf,
} from '@family/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useUsers } from '../../api/queries';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { Toast } from '../../components/Toast';
import { formatDate, formatNumber, formatQuantity } from '../../lib/format';
import { useNow } from '../../lib/use-now';
import { useOnline } from '../../lib/use-online';
import { usePlan } from '../menu/queries';
import { useMakeStaple, useMarkRanOut } from '../pantry/queries';
import { AddItemSheet } from './AddItemSheet';
import {
  OfflineError,
  shoppingKeys,
  useDeleteManualItem,
  useSetHidden,
  useShoppingWeek,
  useToggleCheck,
} from './queries';
import { SourcesSheet } from './SourcesSheet';
import '../recipes/recipes.css';
import '../menu/menu.css';
import './shopping.css';

const AISLE_LABELS = Object.fromEntries(
  AISLES.map(({ key, labelBg }) => [key, labelBg]),
) as Record<Aisle, string>;

/**
 * `/shopping`: списъкът за пазаруване на тази или следващата седмица, по щанд. Работи и без връзка: показва
 * последния успешен списък, а отметките чакат в опашка.
 */
export function ShoppingWeek() {
  const now = useNow(60_000);
  const thisWeek = weekStartOf(now);
  const nextWeek = addDays(thisWeek, 7);
  const [weekStart, setWeekStart] = useState<DateKey>(thisWeek);
  useRefreshWhenOnline();

  return (
    <main className="screen recipes menu shopping">
      <header className="recipes__header">
        <h1 className="recipes__title">Пазаруване</h1>
      </header>
      <nav className="menu__weeks" aria-label="Седмица">
        <div className="menu__tabs" role="tablist">
          {(
            [
              [thisWeek, 'Тази седмица'],
              [nextWeek, 'Следваща седмица'],
            ] as const
          ).map(([week, label]) => (
            <button
              key={week}
              type="button"
              role="tab"
              className="menu__tab"
              aria-selected={weekStart === week}
              onClick={() => setWeekStart(week)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      <p className="menu__range">
        {formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}
      </p>
      <Week key={weekStart} weekStart={weekStart} now={now} />
    </main>
  );
}

/** При върната връзка списъкът се презарежда, а с това се изпраща и опашката. */
function useRefreshWhenOnline() {
  const queryClient = useQueryClient();
  useEffect(() => {
    function onOnline() {
      void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [queryClient]);
}

function Week({ weekStart, now }: { weekStart: DateKey; now: Date }) {
  const week = useShoppingWeek(weekStart);
  const users = useUsers();

  if (week.isPending) {
    return <Spinner />;
  }
  if (week.isError) {
    return <ErrorBox error={week.error} onRetry={() => void week.refetch()} />;
  }
  if (week.data.kind === 'no_plan') {
    return (
      <div className="recipes__empty">
        <p>Няма меню за тази седмица</p>
        <Link to="/menu" className="button">
          Към менюто
        </Link>
      </div>
    );
  }
  const { list, staleSince, pending } = week.data;
  return (
    <>
      <NotAgreed weekStart={weekStart} now={now} />
      <p className="shopping__count">
        <span className="shopping__count-value">
          {list.remaining} от {list.total}
        </span>{' '}
        за купуване
      </p>
      {staleSince && (
        <p className="shopping__stale" role="status">
          Няма връзка · остарели данни от {formatAge(staleSince, now)}
        </p>
      )}
      {pending > 0 && (
        <p className="shopping__pending" role="status">
          {pending === 1
            ? '1 отметка чака връзка'
            : `${pending} отметки чакат връзка`}
        </p>
      )}
      <ListView list={list} weekStart={weekStart} users={users.data ?? []} />
    </>
  );
}

/**
 * Лентата „Менюто още не е съгласувано“ (GLOSSARY: Съгласувано меню), докато има ястие от днес нататък, което не е
 * „Остава“. Списъкът не се филтрира по гласовете; без план или без връзка лентата я няма.
 */
function NotAgreed({ weekStart, now }: { weekStart: DateKey; now: Date }) {
  const plan = usePlan(weekStart);
  const users = useUsers();
  if (!plan.data || !users.data) {
    return null;
  }
  const waiting = countWaiting(plan.data, users.data, now);
  if (waiting === 0) {
    return null;
  }
  return (
    <p className="shopping__not-agreed" role="status">
      Менюто още не е съгласувано:{' '}
      {waiting === 1 ? '1 ястие чака' : `${waiting} ястия чакат`}.{' '}
      <Link
        to="/menu"
        search={weekStart === weekStartOf(now) ? {} : { week: weekStart }}
      >
        Към менюто
      </Link>
    </p>
  );
}

function countWaiting(plan: MealPlan, users: User[], now: Date): number {
  return mealsToAgree(
    plan.meals,
    users.map((user) => user.id),
    dateKeyInSofia(now),
  ).length;
}

interface ListViewProps {
  list: ShoppingList;
  weekStart: DateKey;
  users: User[];
}

function ListView({ list, weekStart, users }: ListViewProps) {
  const toggle = useToggleCheck(weekStart);
  const setHidden = useSetHidden(weekStart);
  const deleteItem = useDeleteManualItem(weekStart);
  const markRanOut = useMarkRanOut();
  const makeStaple = useMakeStaple();
  const online = useOnline();
  const [sourcesOf, setSourcesOf] = useState<ShoppingItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showPantry, setShowPantry] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function onError(error: unknown) {
    setToast(
      error instanceof OfflineError
        ? 'Няма връзка'
        : error instanceof Error
          ? error.message
          : 'Нещо се обърка',
    );
  }

  const rowActions: RowActions = {
    onToggle: (item) => void toggle(item),
    onSources: setSourcesOf,
    onHide: (item) => setHidden.mutate({ item, hidden: true }, { onError }),
    onDelete: (item) => deleteItem.mutate(item, { onError }),
  };

  function alwaysHave(item: ShoppingItem) {
    const { ingredientId } = item;
    if (ingredientId === undefined) {
      return;
    }
    makeStaple.mutate(
      item.pantry ? { pantryId: item.pantry.id } : { ingredientId },
      { onError, onSuccess: () => setSourcesOf(null) },
    );
  }

  return (
    <>
      {list.aisles.length === 0 ? (
        <p className="shopping__empty">Списъкът е празен.</p>
      ) : (
        list.aisles.map(({ aisle, items }) => (
          <section
            key={aisle}
            className="shopping__aisle"
            aria-label={AISLE_LABELS[aisle]}
          >
            <h2 className="shopping__aisle-title">{AISLE_LABELS[aisle]}</h2>
            <ul className="shopping__items">
              {items.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  checkedBy={users.find((u) => u.id === item.checkedBy)}
                  {...rowActions}
                />
              ))}
            </ul>
          </section>
        ))
      )}
      <button
        type="button"
        className="button shopping__add"
        onClick={() => setAdding(true)}
      >
        + Добави
      </button>
      {list.hidden.length > 0 && (
        <section className="shopping__hidden">
          <button
            type="button"
            className="shopping__hidden-toggle"
            aria-expanded={showHidden}
            onClick={() => setShowHidden((open) => !open)}
          >
            Скрити ({list.hidden.length})
          </button>
          {showHidden && (
            <ul className="shopping__items" aria-label="Скрити">
              {list.hidden.map((item) => (
                <li key={item.key} className="shopping-item">
                  <span className="shopping-item__main">
                    <span className="shopping-item__title">{item.title}</span>
                    <span className="shopping-item__quantity">
                      {formatItemQuantity(item)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="button button--quiet shopping-item__action"
                    aria-label={`Покажи ${item.title}`}
                    onClick={() =>
                      setHidden.mutate({ item, hidden: false }, { onError })
                    }
                  >
                    покажи
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {list.pantryHidden.length > 0 && (
        <section className="shopping__pantry">
          <button
            type="button"
            className="shopping__pantry-toggle"
            aria-expanded={showPantry}
            onClick={() => setShowPantry((open) => !open)}
          >
            🏠 Скрити от килера: {list.pantryHidden.length}
          </button>
          {showPantry && (
            <>
              <ul className="shopping__items" aria-label="Скрити от килера">
                {list.pantryHidden.map((item) => (
                  <li key={item.key} className="shopping-item">
                    <span className="shopping-item__main">
                      <span className="shopping-item__title">{item.title}</span>
                      <span className="shopping-item__quantity">
                        {formatItemQuantity(item)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="button button--quiet shopping-item__action"
                      aria-label={`Свърши ${item.title}`}
                      disabled={!online || !item.pantry}
                      onClick={() =>
                        item.pantry &&
                        markRanOut.mutate(item.pantry.id, { onError })
                      }
                    >
                      Свърши
                    </button>
                  </li>
                ))}
              </ul>
              {!online && <p className="shopping__hint">Иска връзка</p>}
              <Link to="/pantry" className="shopping__pantry-link">
                Към килера
              </Link>
            </>
          )}
        </section>
      )}
      {sourcesOf && (
        <SourcesSheet
          item={sourcesOf}
          online={online}
          onAlwaysHave={alwaysHave}
          onClose={() => setSourcesOf(null)}
        />
      )}
      {adding && (
        <AddItemSheet weekStart={weekStart} onClose={() => setAdding(false)} />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

/** „200 г“, „2 бр.“, „по вкус“; ръчен ред без количество — нищо. */
function formatItemQuantity(item: ShoppingItem): string {
  if (item.unit === null) {
    return item.quantity === null ? '' : formatNumber(item.quantity);
  }
  return formatQuantity({ quantity: item.quantity, unit: item.unit });
}

/** „свърши“ на свършил постоянен продукт; „🏠 в килера — провери“ и бележката на временен. */
function PantryBadge({ item }: { item: ShoppingItem }) {
  if (item.pantry?.ranOut) {
    return (
      <span className="shopping-item__badge shopping-item__badge--ran-out">
        свърши
      </span>
    );
  }
  if (item.pantry?.kind === 'use_up') {
    return (
      <span className="shopping-item__badge">
        🏠 в килера — провери
        {item.pantry.note ? ` · ${item.pantry.note}` : ''}
      </span>
    );
  }
  return null;
}

interface RowActions {
  onToggle: (item: ShoppingItem) => void;
  onSources: (item: ShoppingItem) => void;
  onHide: (item: ShoppingItem) => void;
  onDelete: (item: ShoppingItem) => void;
}

function ItemRow({
  item,
  checkedBy,
  onToggle,
  onSources,
  onHide,
  onDelete,
}: RowActions & { item: ShoppingItem; checkedBy: User | undefined }) {
  const [confirming, setConfirming] = useState(false);
  const checked = item.checkedBy !== null;
  const manual = item.kind === 'manual';
  return (
    <li className="shopping-item" data-checked={checked}>
      <input
        type="checkbox"
        className="shopping-item__check"
        aria-label={item.title}
        checked={checked}
        onChange={() => onToggle(item)}
      />
      <span className="shopping-item__main">
        {manual ? (
          <span className="shopping-item__title">{item.title}</span>
        ) : (
          <button
            type="button"
            className="shopping-item__title shopping-item__title--button"
            aria-label={`${item.title}: от кои ястия`}
            onClick={() => onSources(item)}
          >
            {item.title}
          </button>
        )}
        <span className="shopping-item__quantity">
          {formatItemQuantity(item)}
        </span>
        <PantryBadge item={item} />
        {manual && (
          <span
            className="shopping-item__manual"
            role="img"
            aria-label="добавен на ръка"
            title="добавен на ръка"
          >
            ✎
          </span>
        )}
      </span>
      {checked && checkedBy && (
        <span title={`Отметнато от ${checkedBy.name}`}>
          <Avatar
            initial={checkedBy.initial}
            color={checkedBy.color}
            size="sm"
          />
        </span>
      )}
      {manual ? (
        confirming ? (
          <span
            className="shopping-item__confirm"
            role="alertdialog"
            aria-label={`Изтриване на ${item.title}`}
          >
            <button
              type="button"
              className="button menu__danger shopping-item__action"
              onClick={() => onDelete(item)}
            >
              Изтрий
            </button>
            <button
              type="button"
              className="button button--quiet shopping-item__action"
              onClick={() => setConfirming(false)}
            >
              Откажи
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="button button--quiet shopping-item__action"
            aria-label={`Изтрий ${item.title}`}
            onClick={() => setConfirming(true)}
          >
            изтрий
          </button>
        )
      ) : (
        <button
          type="button"
          className="button button--quiet shopping-item__action"
          aria-label={`Скрий ${item.title}`}
          onClick={() => onHide(item)}
        >
          скрий
        </button>
      )}
    </li>
  );
}
