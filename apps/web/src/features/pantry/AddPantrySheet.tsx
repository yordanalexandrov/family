import {
  type Ingredient,
  normalizeIngredientName,
  PANTRY_NOTE_MAX,
  type PantryKind,
} from '@family/shared';
import { type FormEvent, useState } from 'react';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { NewIngredientForm } from '../recipes/NewIngredientForm';
import { useIngredientSearch } from '../recipes/queries';
import { useDebouncedValue } from '../recipes/useDebouncedValue';
import { useAddPantryItems } from './queries';

const SEARCH_DEBOUNCE_MS = 200;

const KINDS: { kind: PantryKind; label: string }[] = [
  { kind: 'staple', label: 'Постоянен' },
  { kind: 'use_up', label: 'Временен' },
];

function submitLabel(count: number): string {
  return count === 1 ? 'Добави 1 продукт' : `Добави ${count} продукта`;
}

/**
 * „Добави в килера“: търсене в продуктите (`GET /api/ingredients?q=`) с избор на няколко, нов продукт на място
 * (`NewIngredientForm`), един вид и „Във фризера“ за целия избор и бележка по избор. Продуктите, които вече са в килера, не се
 * предлагат. Листът се затваря веднага; записът е оптимистичен.
 */
export function AddPantrySheet({
  inPantry,
  onClose,
  onError,
}: {
  /** Id-тата на продуктите в килера. */
  inPantry: ReadonlySet<string>;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Ingredient[]>([]);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<PantryKind>('staple');
  const [note, setNote] = useState('');
  const [frozen, setFrozen] = useState(false);
  const add = useAddPantryItems();
  const search = useIngredientSearch(
    useDebouncedValue(creating ? '' : query, SEARCH_DEBOUNCE_MS),
  );
  const searching = query.trim() !== '' && !creating;
  const found = searching ? (search.data ?? []) : [];
  const options = found.filter(
    (option) =>
      !inPantry.has(option.id) &&
      !selected.some((chosen) => chosen.id === option.id),
  );
  const exactMatch = found.some(
    (option) => option.name === normalizeIngredientName(query),
  );

  function select(ingredient: Ingredient) {
    setSelected((current) =>
      current.some((chosen) => chosen.id === ingredient.id)
        ? current
        : [...current, ingredient],
    );
  }

  function unselect(ingredient: Ingredient) {
    setSelected((current) =>
      current.filter((chosen) => chosen.id !== ingredient.id),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (selected.length === 0) {
      return;
    }
    add.mutate(
      { ingredients: selected, kind, note, frozen },
      {
        onError: (error) =>
          onError(error instanceof Error ? error.message : 'Нещо се обърка'),
      },
    );
    onClose();
  }

  return (
    <Sheet title="Добави в килера" onClose={onClose}>
      <form className="pantry__form" noValidate onSubmit={submit}>
        <Field label="Търси продукт">
          {(props) => (
            <input
              {...props}
              type="search"
              className="field__input"
              autoComplete="off"
              placeholder="напр. ориз"
              value={query}
              onChange={(event) => {
                setCreating(false);
                setQuery(event.target.value);
              }}
            />
          )}
        </Field>
        {(selected.length > 0 || options.length > 0) && (
          <ul className="pantry__choices" aria-label="Продукти">
            {[...selected, ...options].map((ingredient) => {
              const checked = selected.includes(ingredient);
              return (
                <li key={ingredient.id}>
                  <label className="pantry__choice">
                    <input
                      type="checkbox"
                      className="shopping-item__check"
                      checked={checked}
                      onChange={() =>
                        checked ? unselect(ingredient) : select(ingredient)
                      }
                    />
                    {ingredient.name}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {searching && search.data && !exactMatch && (
          <button
            type="button"
            className="button button--quiet pantry__new"
            onClick={() => setCreating(true)}
          >
            Нов продукт
          </button>
        )}
        {creating && (
          <NewIngredientForm
            initialName={query.trim()}
            onCreated={(ingredient) => {
              select(ingredient);
              setCreating(false);
              setQuery('');
            }}
            onCancel={() => setCreating(false)}
          />
        )}
        <fieldset className="sheet__section">
          <legend className="field__label">Вид</legend>
          <div className="pantry__kinds">
            {KINDS.map((option) => (
              <label key={option.kind} className="pantry__kind">
                <input
                  type="radio"
                  name="pantry-kind"
                  checked={kind === option.kind}
                  onChange={() => setKind(option.kind)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="pantry__kind pantry__frozen">
          <input
            type="checkbox"
            checked={frozen}
            onChange={(event) => setFrozen(event.target.checked)}
          />
          ❄️ Във фризера
        </label>
        <Field label="Бележка">
          {(props) => (
            <input
              {...props}
              className="field__input"
              maxLength={PANTRY_NOTE_MAX}
              placeholder="по избор, напр. фризер"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
        <button
          type="submit"
          className="button"
          disabled={selected.length === 0}
        >
          {selected.length === 0 ? 'Добави' : submitLabel(selected.length)}
        </button>
      </form>
    </Sheet>
  );
}
