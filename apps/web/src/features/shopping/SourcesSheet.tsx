import type { ShoppingItem } from '@family/shared';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { formatDayLong } from '../../lib/format';
import { NEEDS_CONNECTION } from '../../lib/use-online';

/**
 * Менюто на реда, отворено с ⓘ: „От кои ястия“ (денят и рецептата на всяко ястие, което внася реда), „Скрий от
 * списъка“ и „Имаме го винаги“ за изчислен ред, чийто продукт още не е постоянен в килера; „Изтрий“ с потвърждение
 * за ръчен ред. „Имаме го винаги“ иска връзка.
 */
export function SourcesSheet({
  item,
  online,
  onAlwaysHave,
  onHide,
  onDelete,
  onClose,
}: {
  item: ShoppingItem;
  online: boolean;
  onAlwaysHave: (item: ShoppingItem) => void;
  onHide: (item: ShoppingItem) => void;
  onDelete: (item: ShoppingItem) => void;
  onClose: () => void;
}) {
  if (item.kind === 'manual') {
    return (
      <Sheet title={item.title} onClose={onClose}>
        <p className="field__label">Добавен на ръка</p>
        <DeleteAction item={item} onDelete={onDelete} />
      </Sheet>
    );
  }
  const canMakeStaple =
    item.ingredientId !== undefined && item.pantry?.kind !== 'staple';
  return (
    <Sheet title={item.title} onClose={onClose}>
      {item.sources.length > 0 ? (
        <>
          <p className="field__label">От кои ястия</p>
          <ul className="shopping__sources">
            {item.sources.map((source) => (
              <li key={source.mealId}>
                <span className="shopping__source-day">
                  {formatDayLong(source.date)}
                </span>{' '}
                · {source.recipeTitle}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="field__label">Свърши в килера; менюто не го иска</p>
      )}
      <div className="shopping__sheet-actions">
        <button
          type="button"
          className="button button--quiet"
          onClick={() => onHide(item)}
        >
          Скрий от списъка
        </button>
      </div>
      {canMakeStaple && (
        <div className="shopping__sheet-actions">
          <button
            type="button"
            className="button"
            disabled={!online}
            onClick={() => onAlwaysHave(item)}
          >
            Имаме го винаги
          </button>
          {online ? (
            <p className="shopping__hint">
              Продуктът отива в килера като постоянен и не се показва в списъка.
            </p>
          ) : (
            <p className="shopping__hint">{NEEDS_CONNECTION}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** „Изтрий“ на ръчен ред: второ докосване потвърждава. */
function DeleteAction({
  item,
  onDelete,
}: {
  item: ShoppingItem;
  onDelete: (item: ShoppingItem) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <div className="shopping__sheet-actions">
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setConfirming(true)}
        >
          Изтрий
        </button>
      </div>
    );
  }
  return (
    <div
      className="shopping__sheet-actions"
      role="alertdialog"
      aria-label={`Изтриване на ${item.title}`}
    >
      <button
        type="button"
        className="button menu__danger"
        onClick={() => onDelete(item)}
      >
        Изтрий
      </button>
      <button
        type="button"
        className="button button--quiet"
        onClick={() => setConfirming(false)}
      >
        Откажи
      </button>
    </div>
  );
}
