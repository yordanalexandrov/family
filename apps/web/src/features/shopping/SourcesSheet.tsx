import type { ShoppingItem } from '@family/shared';
import { Sheet } from '../../components/Sheet';
import { formatDayLong } from '../../lib/format';

/**
 * Менюто на реда: „От кои ястия“ (денят и рецептата на всяко ястие, което внася реда) и „Имаме го винаги“ за
 * изчислен ред, чийто продукт още не е постоянен в килера. „Имаме го винаги“ иска връзка.
 */
export function SourcesSheet({
  item,
  online,
  onAlwaysHave,
  onClose,
}: {
  item: ShoppingItem;
  online: boolean;
  onAlwaysHave: (item: ShoppingItem) => void;
  onClose: () => void;
}) {
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
            <p className="shopping__hint">Иска връзка</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
