import { type Ingredient, UNIT_LABELS_BG, unitSchema } from '@family/shared';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { IngredientPicker } from './IngredientPicker';
import type { IngredientRowValues } from './recipe-form-values';

interface IngredientLineSheetProps {
  row: IngredientRowValues;
  /** Грешките на реда от последния опит за запис, по поле (`ingredientId`, `quantity`). */
  errors: { ingredientId?: string | undefined; quantity?: string | undefined };
  onChange: (patch: Partial<IngredientRowValues>) => void;
  onSelect: (ingredient: Ingredient) => void;
  /** След `onSelect` за продукт, създаден тук с „Нов продукт“. */
  onCreated: (ingredient: Ingredient) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Лист за един ред продукт в `RecipeForm`: продуктът (свързване със съществуващ или „Нов продукт“) е най-горе, така
 * че съвпаденията под него остават над клавиатурата; после количество, мярка и „Премахни ред“.
 */
export function IngredientLineSheet({
  row,
  errors,
  onChange,
  onSelect,
  onCreated,
  onRemove,
  onClose,
}: IngredientLineSheetProps) {
  return (
    <Sheet title="Продукт" onClose={onClose}>
      <Field
        label="Продукт"
        error={row.ingredient === null ? errors.ingredientId : undefined}
      >
        {(props) => (
          <IngredientPicker
            inputProps={props}
            ingredient={row.ingredient}
            query={row.query}
            unit={row.unit}
            isNew={row.isNew}
            newProduct={row.newProduct}
            onQueryChange={(query) => onChange({ query, ingredient: null })}
            onSelect={onSelect}
            onCreated={onCreated}
          />
        )}
      </Field>
      <div className="recipe-form__row">
        <Field label="Количество" error={errors.quantity}>
          {(props) => (
            <input
              {...props}
              className="field__input"
              inputMode="decimal"
              disabled={row.unit === 'pinch'}
              value={row.unit === 'pinch' ? '' : row.quantity}
              onChange={(event) => onChange({ quantity: event.target.value })}
            />
          )}
        </Field>
        <Field label="Единица">
          {(props) => (
            <select
              {...props}
              className="field__input"
              value={row.unit}
              onChange={(event) =>
                onChange({ unit: unitSchema.parse(event.target.value) })
              }
            >
              {unitSchema.options.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABELS_BG[unit]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="recipes__actions">
        <button
          type="button"
          className="button button--quiet"
          onClick={onRemove}
        >
          Премахни ред
        </button>
      </div>
    </Sheet>
  );
}
