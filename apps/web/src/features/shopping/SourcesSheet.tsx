import type { ShoppingItem } from '@family/shared';
import { Sheet } from '../../components/Sheet';
import { formatDayLong } from '../../lib/format';

/** „От кои ястия“: денят и рецептата на всяко ястие, което внася реда. */
export function SourcesSheet({
  item,
  onClose,
}: {
  item: ShoppingItem;
  onClose: () => void;
}) {
  return (
    <Sheet title={item.title} onClose={onClose}>
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
    </Sheet>
  );
}
