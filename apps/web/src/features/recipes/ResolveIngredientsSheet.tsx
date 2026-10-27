import { type Ingredient, UNIT_LABELS_BG } from '@family/shared';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { IngredientPicker } from './IngredientPicker';
import type { IngredientRowValues } from './recipe-form-values';

/** Ред за свързване: ключът на реда във формата и името, с което е дошъл (от предложението). */
export interface PendingRow {
  key: string;
  name: string;
}

interface ResolveIngredientsSheetProps {
  /** Редовете, които бяха без продукт при отварянето; остават в списъка и след свързване. */
  pending: PendingRow[];
  /** Текущите редове на формата: оттам идва състоянието на всеки ред. */
  rows: IngredientRowValues[];
  onQueryChange: (key: string, query: string) => void;
  onSelect: (key: string, ingredient: Ingredient) => void;
  onConfirm: () => void;
  onClose: () => void;
  confirmLabel: string;
  isSubmitting: boolean;
  submitError?: unknown;
}

function amount(row: IngredientRowValues): string {
  const unit = UNIT_LABELS_BG[row.unit];
  return row.unit === 'pinch' || row.quantity.trim() === ''
    ? unit
    : `${row.quantity} ${unit}`;
}

/**
 * Диалогът след „Одобри“: само продуктите без съвпадение в регистъра. Всеки се свързва със съществуващ продукт
 * или се създава нов (`IngredientPicker`); изборът се пише направо във формата, затова „Готово“ го пази.
 */
export function ResolveIngredientsSheet({
  pending,
  rows,
  onQueryChange,
  onSelect,
  onConfirm,
  onClose,
  confirmLabel,
  isSubmitting,
  submitError,
}: ResolveIngredientsSheetProps) {
  const items = pending.flatMap((item) => {
    const row = rows.find((r) => r.key === item.key);
    return row ? [{ ...item, row }] : [];
  });
  const resolvedCount = items.filter(
    (item) => item.row.ingredient !== null,
  ).length;
  const allResolved = resolvedCount === items.length;

  return (
    <Sheet title="Нови продукти" onClose={onClose}>
      <p className="resolve__progress" aria-live="polite">
        Свързани {resolvedCount} от {items.length}
      </p>
      {items.map(({ key, name, row }) => (
        <fieldset
          key={key}
          className="sheet__section resolve__item"
          aria-label={name}
        >
          <div className="resolve__item-head">
            <span className="resolve__name">{name}</span>
            <span className="resolve__amount">{amount(row)}</span>
          </div>
          {row.ingredient ? (
            <p className="resolve__done">✓ Свързан с „{row.ingredient.name}“</p>
          ) : null}
          <Field label="Продукт">
            {(props) => (
              <IngredientPicker
                inputProps={props}
                ingredient={row.ingredient}
                query={row.query}
                unit={row.unit}
                isNew={row.isNew}
                newProduct={row.newProduct}
                onQueryChange={(query) => onQueryChange(key, query)}
                onSelect={(ingredient) => onSelect(key, ingredient)}
              />
            )}
          </Field>
        </fieldset>
      ))}
      {submitError !== undefined && submitError !== null && (
        <ErrorBox error={submitError} />
      )}
      <div className="recipes__actions">
        <button
          type="button"
          className="button"
          disabled={!allResolved || isSubmitting}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
