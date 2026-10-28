import {
  type Ingredient,
  type NewProduct,
  normalizeIngredientName,
  type Unit,
} from '@family/shared';
import { useId, useState } from 'react';
import { NewIngredientForm } from './NewIngredientForm';
import { useIngredientSearch } from './queries';
import { baseUnitFor } from './recipe-form-values';
import { useDebouncedValue } from './useDebouncedValue';

const SEARCH_DEBOUNCE_MS = 200;

interface IngredientPickerProps {
  ingredient: Ingredient | null;
  query: string;
  /** Единицата в реда; от нея идва основната единица на нов продукт. */
  unit: Unit;
  /** Ред от предложение, който го няма в регистъра. */
  isNew?: boolean | undefined;
  /** Предложеният нов продукт (от внасяне): основната единица и щандът на „Нов продукт“ идват от него. */
  newProduct?: NewProduct | undefined;
  onQueryChange: (query: string) => void;
  onSelect: (ingredient: Ingredient) => void;
  /** След `onSelect` за продукт, създаден тук с „Нов продукт“. */
  onCreated?: ((ingredient: Ingredient) => void) | undefined;
  inputProps: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  };
}

/**
 * Autocomplete по `GET /api/ingredients?q=`. Докато редът няма избран продукт, показва съвпаденията
 * и бутон „Нов продукт“, ако няма точно съвпадение по каноничното име.
 */
export function IngredientPicker({
  ingredient,
  query,
  unit,
  isNew = false,
  newProduct,
  onQueryChange,
  onSelect,
  onCreated,
  inputProps,
}: IngredientPickerProps) {
  const listId = useId();
  const [creating, setCreating] = useState(false);
  const unresolved = ingredient === null && query.trim() !== '';
  const search = useIngredientSearch(
    useDebouncedValue(unresolved && !creating ? query : '', SEARCH_DEBOUNCE_MS),
  );
  const options = unresolved && !creating ? (search.data ?? []) : [];
  const exactMatch = options.some(
    (option) => option.name === normalizeIngredientName(query),
  );

  function select(next: Ingredient) {
    setCreating(false);
    onSelect(next);
  }

  return (
    <div className="ingredient-picker">
      <input
        {...inputProps}
        aria-controls={listId}
        className="field__input"
        autoComplete="off"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        // Полето отива горе, така че съвпаденията под него остават над клавиатурата.
        onFocus={(event) =>
          event.currentTarget.scrollIntoView({ block: 'start' })
        }
      />
      {unresolved && (
        <p className="ingredient-picker__unresolved">
          {isNew
            ? 'Нов продукт: избери съществуващ или създай нов'
            : 'Непознат продукт: избери от списъка или създай нов'}
        </p>
      )}
      <ul
        className="ingredient-picker__options"
        id={listId}
        aria-label="Съвпадения"
        hidden={options.length === 0}
      >
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className="ingredient-picker__option"
              onClick={() => select(option)}
            >
              {option.name}
            </button>
          </li>
        ))}
      </ul>
      {unresolved && !creating && search.data && !exactMatch && (
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setCreating(true)}
        >
          Нов продукт
        </button>
      )}
      {creating && (
        <NewIngredientForm
          initialName={query.trim()}
          initialUnit={newProduct?.unit ?? baseUnitFor(unit)}
          initialAisle={newProduct?.aisle}
          onCreated={(created) => {
            select(created);
            onCreated?.(created);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
