import {
  type DateKey,
  dateKeyInSofia,
  daysBetween,
  type PantryItem,
} from '@family/shared';
import { useState } from 'react';
import { ScreenHeader } from '../../app/ScreenHeader';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { Toast } from '../../components/Toast';
import { useNow } from '../../lib/use-now';
import { AddPantrySheet } from './AddPantrySheet';
import {
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

/**
 * `/pantry` (GLOSSARY: Килер), само на телефона: постоянните продукти по име и временните от най-старите, с бележката
 * и възрастта им; ❄️ до името на тези „Във фризера“. Промените са оптимистични и се връщат при грешка.
 */
export function PantryScreen() {
  const pantry = usePantry();
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <main className="screen recipes menu pantry">
      <ScreenHeader
        title="Килер"
        actions={
          <button
            type="button"
            className="button"
            disabled={!pantry.data}
            onClick={() => setAdding(true)}
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
        <Groups items={pantry.data} onError={setToast} />
      )}
      {adding && pantry.data && (
        <AddPantrySheet
          inPantry={new Set(pantry.data.map((item) => item.ingredient.id))}
          onClose={() => setAdding(false)}
          onError={setToast}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </main>
  );
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

/** Превключвателят „Във фризера“ на един продукт. */
function FrozenToggle({
  item,
  onToggle,
}: {
  item: PantryItem;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="button button--quiet pantry-item__action pantry-item__freeze"
      aria-label={`Във фризера: ${item.ingredient.name}`}
      aria-pressed={item.frozen}
      disabled={isPending(item)}
      onClick={onToggle}
    >
      <span aria-hidden="true">❄️</span>
    </button>
  );
}

function Groups({
  items,
  onError,
}: {
  items: PantryItem[];
  onError: (message: string) => void;
}) {
  const today = dateKeyInSofia(useNow(60_000));
  const setKind = useSetPantryKind();
  const setFrozen = useSetPantryFrozen();
  const remove = useRemovePantryItem();
  const options = { onError: (error: unknown) => onError(errorMessage(error)) };
  const toggleFrozen = (item: PantryItem) => () =>
    setFrozen.mutate({ item, frozen: !item.frozen }, options);
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
              <li key={item.id} className="pantry-item">
                <span className="pantry-item__main">
                  <ItemName item={item} />
                </span>
                <span className="pantry-item__actions">
                  <FrozenToggle item={item} onToggle={toggleFrozen(item)} />
                  <button
                    type="button"
                    className="button button--quiet pantry-item__action"
                    aria-label={`Направи временен: ${item.ingredient.name}`}
                    disabled={isPending(item)}
                    onClick={() =>
                      setKind.mutate({ item, kind: 'use_up' }, options)
                    }
                  >
                    временен
                  </button>
                  <button
                    type="button"
                    className="button button--quiet pantry-item__action pantry-item__remove"
                    aria-label={`Махни: ${item.ingredient.name}`}
                    disabled={isPending(item)}
                    onClick={() => remove.mutate(item, options)}
                  >
                    махни
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
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
              <li key={item.id} className="pantry-item">
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
                    onClick={() =>
                      setKind.mutate({ item, kind: 'staple' }, options)
                    }
                  >
                    постоянен
                  </button>
                  <button
                    type="button"
                    className="button pantry-item__action pantry-item__used"
                    aria-label={`Използвано: ${item.ingredient.name}`}
                    disabled={isPending(item)}
                    onClick={() => remove.mutate(item, options)}
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
