import {
  type DateKey,
  dateKeyInSofia,
  daysBetween,
  type Ingredient,
  type PantryItem,
  type PantryKind,
} from '@family/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '../../app/ScreenHeader';
import { ErrorBox } from '../../components/ErrorBox';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Spinner } from '../../components/Spinner';
import { Toast, type ToastMessage } from '../../components/Toast';
import { useNow } from '../../lib/use-now';
import { useOnline } from '../../lib/use-online';
import { AddPantrySheet } from './AddPantrySheet';
import {
  useMarkRanOut,
  usePantry,
  useRemovePantryItem,
  useSetPantryFrozen,
  useSetPantryKind,
} from './queries';
import '../recipes/recipes.css';
import '../menu/menu.css';
import './pantry.css';
import { errorMessage } from '../../lib/error-message';

/** „от днес“, „от 1 ден“, „от 12 дни“: колко дни (по календара в София) продуктът е в килера. */
export function formatPantryAge(createdAt: string, today: DateKey): string {
  const days = daysBetween(dateKeyInSofia(new Date(createdAt)), today);
  if (days <= 0) {
    return 'от днес';
  }
  return days === 1 ? 'от 1 ден' : `от ${days} дни`;
}

/** Ред, който още се записва (оптимистичен), няма id в api-то и не се пипа. */
function isPending(item: PantryItem): boolean {
  return item.id.startsWith('pending:');
}

/** „Добавен: кайма“ или „Добавени: 3 продукта“. */
function addedMessage(ingredients: Ingredient[]): string {
  return ingredients.length === 1
    ? `Добавен: ${ingredients[0]?.name}`
    : `Добавени: ${ingredients.length} продукта`;
}

/**
 * `/pantry` (GLOSSARY: Килер), само на телефона: постоянните продукти по име и временните от най-старите, с бележката
 * и възрастта им; ❄️ до името на тези „Във фризера“. Постоянният продукт има „Свърши“ и знак „свърши · в списъка“ до
 * покупката. Промените са оптимистични и се връщат при грешка; след „Добави“ екранът казва какво е добавено и
 * превърта до първия нов ред. „Използвано“ и „махни“ чакат toast-а с „Върни“, преди да изтрият (#129 D-05).
 */
export function PantryScreen() {
  const pantry = usePantry();
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showMessage = useCallback(
    (message: string) => setToast({ message }),
    [],
  );
  const closeToast = useCallback(() => setToast(null), []);
  const removal = useDeferredRemoval(showMessage, closeToast);
  const { flush } = removal;
  const onToastDone = useCallback(() => {
    setToast(null);
    flush();
  }, [flush]);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (scrollTo === null || !pantry.data) {
      return;
    }
    const row = mainRef.current?.querySelector(
      `[data-ingredient-id="${scrollTo}"]`,
    );
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setScrollTo(null);
    }
  }, [scrollTo, pantry.data]);

  function remove(item: PantryItem) {
    removal.schedule(item);
    setToast({
      message: `Махна „${item.ingredient.name}“ от килера`,
      undo: removal.undo,
    });
  }

  return (
    <main ref={mainRef} className="screen recipes menu pantry">
      <ScreenHeader
        title="Килер"
        actions={
          <button
            type="button"
            className="button"
            disabled={!pantry.data}
            onClick={() => {
              flush();
              setAdding(true);
            }}
          >
            Добави
          </button>
        }
      />
      {pantry.isPending ? (
        <Spinner />
      ) : pantry.isError ? (
        <ErrorBox error={pantry.error} onRetry={() => void pantry.refetch()} />
      ) : (
        <Groups
          items={pantry.data.filter((item) => !removal.removing.has(item.id))}
          onError={showMessage}
          onRemove={remove}
          onAction={flush}
        />
      )}
      {adding && pantry.data && (
        <AddPantrySheet
          inPantry={new Set(pantry.data.map((item) => item.ingredient.id))}
          onClose={() => setAdding(false)}
          onAdded={(ingredients) => {
            showMessage(addedMessage(ingredients));
            setScrollTo(ingredients[0]?.id ?? null);
          }}
          onError={showMessage}
        />
      )}
      <Toast
        message={toast?.message ?? null}
        onDone={onToastDone}
        undo={toast?.undo}
      />
    </main>
  );
}

/**
 * Изтриване, което чака: редът изчезва веднага (`removing`), а `DELETE` тръгва при `flush` — изтичането на toast-а,
 * ново действие, напускане на екрана, презареждане, затваряне или скриване на приложението. `undo` го отменя без заявка, затова бележката и възрастта остават. При
 * грешка `useRemovePantryItem` връща килера, а редът се показва пак.
 */
function useDeferredRemoval(
  onError: (message: string) => void,
  /** Изтриването тръгна, защото страницата се скрива: „Върни“ вече не може да го отмени. */
  onLeave: () => void,
) {
  const remove = useRemovePantryItem();
  const mutate = useRef(remove.mutate);
  mutate.current = remove.mutate;
  const pending = useRef<PantryItem | null>(null);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());

  const show = useCallback((id: string) => {
    setRemoving((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const flush = useCallback(() => {
    const item = pending.current;
    if (!item) {
      return;
    }
    pending.current = null;
    mutate.current(item, {
      onError: (error) => onError(errorMessage(error)),
      onSettled: () => show(item.id),
    });
  }, [onError, show]);

  useEffect(() => {
    // Презареждане, затваряне или скриване на приложението не чака toast-а: изтриването тръгва веднага (#209).
    const leave = () => {
      if (pending.current) {
        flush();
        onLeave();
      }
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        leave();
      }
    };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', onHidden);
      flush();
    };
  }, [flush, onLeave]);

  return {
    removing,
    flush,
    schedule(item: PantryItem) {
      flush();
      pending.current = item;
      setRemoving((current) => new Set(current).add(item.id));
    },
    undo() {
      const item = pending.current;
      pending.current = null;
      if (item) {
        show(item.id);
      }
    },
  };
}

/** Името на продукта и ❄️, ако е „Във фризера“ (GLOSSARY: Във фризера). */
function ItemName({ item }: { item: PantryItem }) {
  return (
    <span className="pantry-item__title">
      <span className="pantry-item__name">{item.ingredient.name}</span>
      {item.frozen && (
        <span
          className="pantry-item__frozen"
          role="img"
          aria-label="Във фризера"
        >
          ❄️
        </span>
      )}
    </span>
  );
}

/** Превключвателят „❄️ Във фризера“ на продукт от килера, като в листа за добавяне. */
function FrozenToggle({
  item,
  onToggle,
}: {
  item: PantryItem;
  onToggle: () => void;
}) {
  return (
    <label className="pantry__kind pantry-item__freeze">
      <input
        type="checkbox"
        checked={item.frozen}
        disabled={isPending(item)}
        onChange={onToggle}
      />
      ❄️ Във фризера
    </label>
  );
}

function Groups({
  items,
  onError,
  onRemove,
  onAction,
}: {
  items: PantryItem[];
  onError: (message: string) => void;
  /** „Използвано“ или „махни“: изтриване, което чака „Върни“. */
  onRemove: (item: PantryItem) => void;
  /** Всяко друго действие на ред; изпраща изчакващото изтриване. */
  onAction: () => void;
}) {
  const today = dateKeyInSofia(useNow(60_000));
  const ranOutOffline = useNeedsConnection(useOnline());
  const markRanOut = useMarkRanOut();
  const setKindMutation = useSetPantryKind();
  const setFrozen = useSetPantryFrozen();
  const options = { onError: (error: unknown) => onError(errorMessage(error)) };
  const setKind = (item: PantryItem, kind: PantryKind) => {
    onAction();
    setKindMutation.mutate({ item, kind }, options);
  };
  const toggleFrozen = (item: PantryItem) => () => {
    onAction();
    setFrozen.mutate({ item, frozen: !item.frozen }, options);
  };
  const staples = items
    .filter((item) => item.kind === 'staple')
    .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'bg'));
  const useUp = items
    .filter((item) => item.kind === 'use_up')
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        a.ingredient.name.localeCompare(b.ingredient.name, 'bg'),
    );

  return (
    <>
      <section className="pantry__group" aria-label="Постоянни">
        <h2 className="pantry__group-title">Постоянни</h2>
        <p className="pantry__hint">Винаги ги има; не влизат в списъка.</p>
        {staples.length === 0 ? (
          <p className="pantry__empty">Няма постоянни продукти.</p>
        ) : (
          <ul className="pantry__items">
            {staples.map((item) => (
              <li
                key={item.id}
                className="pantry-item"
                data-ingredient-id={item.ingredient.id}
              >
                <span className="pantry-item__main">
                  <ItemName item={item} />
                  {item.ranOutAt && (
                    <span className="pantry-item__badge">
                      свърши · в списъка
                    </span>
                  )}
                </span>
                <span className="pantry-item__actions">
                  <FrozenToggle item={item} onToggle={toggleFrozen(item)} />
                  <button
                    type="button"
                    className="button button--quiet pantry-item__action"
                    aria-label={`Свърши: ${item.ingredient.name}`}
                    disabled={
                      ranOutOffline.disabled ||
                      isPending(item) ||
                      !!item.ranOutAt
                    }
                    aria-describedby={ranOutOffline.describedBy}
                    onClick={() => {
                      onAction();
                      markRanOut.mutate(item.id, options);
                    }}
                  >
                    Свърши
                  </button>
                  <button
                    type="button"
                    className="button button--quiet pantry-item__action"
                    aria-label={`Направи временен: ${item.ingredient.name}`}
                    disabled={isPending(item)}
                    onClick={() => setKind(item, 'use_up')}
                  >
                    временен
                  </button>
                  <button
                    type="button"
                    className="button button--quiet pantry-item__action pantry-item__remove"
                    aria-label={`Махни: ${item.ingredient.name}`}
                    disabled={isPending(item)}
                    onClick={() => onRemove(item)}
                  >
                    махни
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {staples.length > 0 && ranOutOffline.hint}
      </section>
      <section className="pantry__group" aria-label="Временни">
        <h2 className="pantry__group-title">Временни</h2>
        <p className="pantry__hint">
          Чакат да се използват; най-старите първо.
        </p>
        {useUp.length === 0 ? (
          <p className="pantry__empty">Няма временни продукти.</p>
        ) : (
          <ul className="pantry__items">
            {useUp.map((item) => (
              <li
                key={item.id}
                className="pantry-item"
                data-ingredient-id={item.ingredient.id}
              >
                <span className="pantry-item__main">
                  <ItemName item={item} />
                  {item.note && (
                    <span className="pantry-item__note">{item.note}</span>
                  )}
                  <span className="pantry-item__age">
                    {formatPantryAge(item.createdAt, today)}
                  </span>
                </span>
                <span className="pantry-item__actions">
                  <FrozenToggle item={item} onToggle={toggleFrozen(item)} />
                  <button
                    type="button"
                    className="button button--quiet pantry-item__action"
                    aria-label={`Направи постоянен: ${item.ingredient.name}`}
                    disabled={isPending(item)}
                    onClick={() => setKind(item, 'staple')}
                  >
                    постоянен
                  </button>
                  <button
                    type="button"
                    className="button pantry-item__action pantry-item__used"
                    aria-label={`Използвано: ${item.ingredient.name}`}
                    disabled={isPending(item)}
                    onClick={() => onRemove(item)}
                  >
                    Използвано
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
