import type { PrepTimeRange, RecipesSort, Tag } from '@family/shared';
import { Sheet } from '../../components/Sheet';
import { TagChips, TimeChips, toggled } from './TagChips';

/** Избраните филтри и подреждането на регистъра. */
export interface RecipeFilters {
  tags: Tag[];
  times: PrepTimeRange[];
  includeArchived: boolean;
  sort: RecipesSort;
}

export const NO_FILTERS: RecipeFilters = {
  tags: [],
  times: [],
  includeArchived: false,
  sort: 'title',
};

/** Без избраните филтри; подреждането остава. */
export function clearedFilters(filters: RecipeFilters): RecipeFilters {
  return { ...NO_FILTERS, sort: filters.sort };
}

/** Колко филтъра са избрани (етикети, интервали, архивираните); подреждането не е филтър. */
export function countFilters(filters: RecipeFilters): number {
  return (
    filters.tags.length +
    filters.times.length +
    (filters.includeArchived ? 1 : 0)
  );
}

const SORT_LABELS: Record<RecipesSort, string> = {
  title: 'по име',
  rating: 'по оценка',
};

/** Листът „Филтри“: групи с етикети; всеки избор се прилага веднага. */
export function RecipeFiltersSheet({
  filters,
  onChange,
  onClose,
}: {
  filters: RecipeFilters;
  onChange: (filters: RecipeFilters) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Филтри" onClose={onClose}>
      {countFilters(filters) > 0 && (
        <button
          type="button"
          className="button button--quiet recipes__clear"
          onClick={() => onChange(clearedFilters(filters))}
        >
          Изчисти
        </button>
      )}
      <div className="sheet__section">
        <span className="field__label" aria-hidden="true">
          Етикет
        </span>
        <TagChips
          label="Етикет"
          selected={filters.tags}
          onToggle={(tag) =>
            onChange({ ...filters, tags: toggled(filters.tags, tag) })
          }
        />
      </div>
      <div className="sheet__section">
        <span className="field__label" aria-hidden="true">
          Време
        </span>
        <TimeChips
          label="Време"
          selected={filters.times}
          onToggle={(time) =>
            onChange({ ...filters, times: toggled(filters.times, time) })
          }
        />
      </div>
      <div className="sheet__section">
        <span className="field__label" aria-hidden="true">
          Подреди
        </span>
        <fieldset className="chips" aria-label="Подреди">
          {(['title', 'rating'] as const).map((value) => (
            <label key={value} className="chip chip--radio">
              <input
                type="radio"
                name="recipes-sort"
                className="visually-hidden"
                checked={filters.sort === value}
                onChange={() => onChange({ ...filters, sort: value })}
              />
              {SORT_LABELS[value]}
            </label>
          ))}
        </fieldset>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={filters.includeArchived}
          onChange={(event) =>
            onChange({ ...filters, includeArchived: event.target.checked })
          }
        />
        Покажи архивираните
      </label>
    </Sheet>
  );
}
