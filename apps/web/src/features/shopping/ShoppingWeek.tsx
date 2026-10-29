import {
  AISLES,
  type Aisle,
  addDays,
  type CreateManualItem,
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
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { queryKeys, useUsers } from '../../api/queries';
import { useActingUser } from '../../app/acting-user';
import { ScreenHeader } from '../../app/ScreenHeader';
import { Avatar } from '../../components/Avatar';
import { ErrorBox } from '../../components/ErrorBox';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Spinner } from '../../components/Spinner';
import { Toast, type ToastMessage } from '../../components/Toast';
import { formatAmounts, formatDate, formatNumber } from '../../lib/format';
import { useNow } from '../../lib/use-now';
import { useOnline } from '../../lib/use-online';
import { usePlan } from '../menu/queries';
import { useMakeStaple, useMarkRanOut } from '../pantry/queries';
import { AddItemSheet } from './AddItemSheet';
import {
  OfflineError,
  shoppingKeys,
  useAddManualItem,
  useDeleteManualItem,
  useSetHidden,
  useShoppingWeek,
  useToggleCheck,
} from './queries';
import { SourcesSheet } from './SourcesSheet';
import '../recipes/recipes.css';
import '../menu/menu.css';
import './shopping.css';
import { errorMessage } from '../../lib/error-message';

const AISLE_LABELS = Object.fromEntries(
  AISLES.map(({ key, labelBg }) => [key, labelBg]),
) as Record<Aisle, string>;

/** Колко стои отметнатият ред на мястото си след последното докосване в списъка. */
const SETTLE_MS = 1500;

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
      <ScreenHeader title="Пазаруване" />
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

/**
 * При върната връзка списъкът се презарежда, а с това се изпраща и опашката; хората също, за да се вижда кой какво е
 * взел (аватарите).
 */
function useRefreshWhenOnline() {
  const queryClient = useQueryClient();
  useEffect(() => {
    function onOnline() {
      void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users });
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
  const { list, staleSince, pending } = week.data;
  return (
    <>
      <NotAgreed weekStart={weekStart} now={now} />
      {list.total > 0 && (
        <p className="shopping__count">
          <span className="shopping__count-value">
            {list.remaining} от {list.total}
          </span>{' '}
          за купуване
        </p>
      )}
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
      <ListView
        list={list}
        weekStart={weekStart}
        now={now}
        users={users.data ?? []}
      />
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
  now: Date;
  users: User[];
}

function ListView({ list, weekStart, now, users }: ListViewProps) {
  const toggle = useToggleCheck(weekStart);
  const setHidden = useSetHidden(weekStart);
  const deleteItem = useDeleteManualItem(weekStart);
  const addItem = useAddManualItem(weekStart);
  const markRanOut = useMarkRanOut();
  const makeStaple = useMakeStaple();
  const online = useOnline();
  const addOffline = useNeedsConnection(online, 'shopping__add-hint');
  const ranOutOffline = useNeedsConnection(online);
  const [sourcesOf, setSourcesOf] = useState<ShoppingItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showPantry, setShowPantry] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // Стабилно: иначе всяко опресняване на списъка рестартира таймера на toast-а.
  const clearToast = useCallback(() => setToast(null), []);
  const { actingUserId } = useActingUser();
  /** Чуждата отметка, която чака „Махни“ (ключът на реда). */
  const [confirming, setConfirming] = useState<string | null>(null);

  function onError(error: unknown) {
    setToast({
      message:
        error instanceof OfflineError ? 'Няма връзка' : errorMessage(error),
    });
  }

  const held = useHeldOrder(list.aisles);
  function setCheck(item: ShoppingItem) {
    held.hold();
    void toggle(item);
  }
  /** Чужда отметка се маха чак след „Махни“ (#129 D-04); „Върни“ в toast-а я слага пак, вече от действащия. */
  function uncheckForeign(item: ShoppingItem, by: User | undefined) {
    setConfirming(null);
    setCheck(item);
    setToast({
      message: by ? `Махна отметката на ${by.name}` : 'Махна отметката',
      undo: () => setCheck({ ...item, checkedBy: null }),
    });
  }
  const rowActions: RowActions = {
    onToggle: (item) => {
      if (isForeignCheck(item, actingUserId)) {
        setConfirming((key) => (key === item.key ? null : item.key));
        return;
      }
      setCheck(item);
    },
    onSources: setSourcesOf,
    onUncheckForeign: uncheckForeign,
  };
  const closeSheet = () => setSourcesOf(null);

  /** „Скрий от списъка“ тръгва веднага; „Върни“ в toast-а го показва пак (#129 D-05). */
  function hide(item: ShoppingItem) {
    setHidden.mutate(
      { item, hidden: true },
      {
        onError,
        onSuccess: () => {
          closeSheet();
          setToast({
            message: `Скри „${item.title}“ от списъка`,
            undo: () => setHidden.mutate({ item, hidden: false }, { onError }),
          });
        },
      },
    );
  }

  /** Изтриване на ръчен ред тръгва веднага; „Върни“ го добавя пак със същото заглавие, количество и щанд. */
  function deleteManual(item: ShoppingItem) {
    deleteItem.mutate(item, {
      onError,
      onSuccess: () => {
        closeSheet();
        setToast({
          message: `Изтри „${item.title}“ от списъка`,
          undo: () => addItem.mutate(manualItemOf(item), { onError }),
        });
      },
    });
  }

  function alwaysHave(item: ShoppingItem) {
    const { ingredientId } = item;
    if (ingredientId === undefined) {
      return;
    }
    makeStaple.mutate(
      item.pantry ? { pantryId: item.pantry.id } : { ingredientId },
      { onError, onSuccess: closeSheet },
    );
  }

  return (
    <>
      {list.aisles.length === 0 ? (
        list.hasMenu && <p className="shopping__empty">Списъкът е празен.</p>
      ) : (
        <div ref={held.listRef} className="shopping__list">
          {held.aisles.map(({ aisle, items }) => (
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
                    confirming={
                      confirming === item.key &&
                      isForeignCheck(item, actingUserId)
                    }
                    {...rowActions}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {!list.hasMenu && (
        <div className="shopping__no-menu">
          <p className="shopping__empty">
            Менюто ще добави продуктите си, когато е готово
          </p>
          <Link
            to="/menu"
            search={weekStart === weekStartOf(now) ? {} : { week: weekStart }}
            className="button button--quiet"
          >
            Към менюто
          </Link>
        </div>
      )}
      {/* Плаващ над долната лента вдясно, в зоната на палеца (#129 D-10), с „Иска връзка“ до себе си. */}
      <div className="shopping__add">
        {addOffline.hint}
        <button
          type="button"
          className="button shopping__add-button"
          disabled={addOffline.disabled}
          aria-describedby={addOffline.describedBy}
          onClick={() => setAdding(true)}
        >
          + Добави
        </button>
      </div>
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
                <li
                  key={item.key}
                  className="shopping-item shopping-item--hidden"
                >
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
                  <li
                    key={item.key}
                    className="shopping-item shopping-item--hidden"
                  >
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
                      disabled={ranOutOffline.disabled || !item.pantry}
                      aria-describedby={ranOutOffline.describedBy}
                      onClick={() =>
                        item.pantry &&
                        markRanOut.mutate(item.pantry.id, {
                          onError,
                          onSuccess: () =>
                            setToast({
                              message: `${item.title} е добавено в списъка`,
                            }),
                        })
                      }
                    >
                      Свърши
                    </button>
                  </li>
                ))}
              </ul>
              {ranOutOffline.hint}
            </>
          )}
          <Link to="/pantry" className="shopping__pantry-link">
            Към килера
          </Link>
        </section>
      )}
      {sourcesOf && (
        <SourcesSheet
          item={sourcesOf}
          online={online}
          onAlwaysHave={alwaysHave}
          onHide={hide}
          onDelete={deleteManual}
          onClose={closeSheet}
        />
      )}
      {adding && (
        <AddItemSheet weekStart={weekStart} onClose={() => setAdding(false)} />
      )}
      <Toast
        message={toast?.message ?? null}
        onDone={clearToast}
        undo={toast?.undo}
      />
    </>
  );
}

/**
 * Редът на редовете, задържан след отметка: отметнатият ред не слиза веднага в края на щанда, а всички редове стоят,
 * където са били при първата отметка, докато не мине `SETTLE_MS` без докосване в списъка. Нов ред (напр. от
 * опресняването) отива в края на щанда си.
 */
function useHeldOrder(aisles: ShoppingList['aisles']) {
  const [keys, setKeys] = useState<string[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  const settleLater = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setKeys(null), SETTLE_MS);
  }, []);

  const holding = keys !== null;
  useEffect(() => {
    const list = listRef.current;
    if (!holding || !list) {
      return;
    }
    list.addEventListener('pointerdown', settleLater);
    return () => list.removeEventListener('pointerdown', settleLater);
  }, [holding, settleLater]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    listRef,
    aisles: keys
      ? aisles.map((group) => ({
          ...group,
          items: group.items.toSorted(
            (a, b) => position(keys, a.key) - position(keys, b.key),
          ),
        }))
      : aisles,
    hold() {
      setKeys(
        (current) =>
          current ?? aisles.flatMap((group) => group.items.map((i) => i.key)),
      );
      settleLater();
    },
  };
}

function position(keys: string[], key: string): number {
  const index = keys.indexOf(key);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/** Ръчният ред като `POST` за „Върни“ след изтриването му. */
function manualItemOf(item: ShoppingItem): CreateManualItem {
  return {
    title: item.title,
    ...(item.quantity === null ? {} : { quantity: item.quantity }),
    ...(item.unit === null ? {} : { unit: item.unit }),
    aisle: item.aisle,
  };
}

/** „200 г“, „2 бр.“, „по вкус“, „3 бр. + 750 г“; ръчен ред без количество — нищо. */
function formatItemQuantity(item: ShoppingItem): string {
  if (item.unit === null) {
    return item.quantity === null ? '' : formatNumber(item.quantity);
  }
  return formatAmounts([
    { quantity: item.quantity, unit: item.unit },
    ...(item.extraAmounts ?? []),
  ]);
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

/** Отметнат от друг, не от действащия потребител на устройството. */
function isForeignCheck(item: ShoppingItem, actingUserId: string | null) {
  return (
    item.checkedBy !== null &&
    actingUserId !== null &&
    item.checkedBy !== actingUserId
  );
}

interface RowActions {
  onToggle: (item: ShoppingItem) => void;
  onSources: (item: ShoppingItem) => void;
  /** „Махни“ на чужда отметка; `by` е отметналият (без списъка с хората — неизвестен). */
  onUncheckForeign: (item: ShoppingItem, by: User | undefined) => void;
}

/**
 * Редът е една цел за отметка: докосване където и да е го отмята, а голямата отметка е вдясно, в зоната на палеца.
 * ⓘ отваря менюто на реда и не отмята. Чужда отметка не се маха с докосване: редът пита и чака „Махни“.
 */
function ItemRow({
  item,
  checkedBy,
  confirming,
  onToggle,
  onSources,
  onUncheckForeign,
}: RowActions & {
  item: ShoppingItem;
  checkedBy: User | undefined;
  confirming: boolean;
}) {
  const checkId = useId();
  const checked = item.checkedBy !== null;
  const manual = item.kind === 'manual';
  return (
    <li className="shopping-item" data-checked={checked}>
      <label htmlFor={checkId} className="shopping-item__label">
        <span className="shopping-item__main">
          <span className="shopping-item__title">{item.title}</span>
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
      </label>
      <button
        type="button"
        className="shopping-item__more"
        aria-label={`Още за ${item.title}`}
        onClick={() => onSources(item)}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>
      <label className="shopping-item__check-area">
        <input
          id={checkId}
          type="checkbox"
          className="shopping-item__check"
          aria-label={item.title}
          checked={checked}
          onChange={() => onToggle(item)}
        />
      </label>
      {confirming && (
        <p className="shopping-item__confirm" role="status">
          <span>
            {checkedBy ? `${checkedBy.name} го взе.` : 'Вече е взето.'} Махни
            отметката?
          </span>
          <button
            type="button"
            className="button shopping-item__confirm-action"
            onClick={() => onUncheckForeign(item, checkedBy)}
          >
            Махни
          </button>
        </p>
      )}
    </li>
  );
}
