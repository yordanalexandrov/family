import {
  type Ingredient,
  type RecipeInput,
  type Tag,
  UNIT_LABELS_BG,
  unitSchema,
} from '@family/shared';
import { type FormEvent, useCallback, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { IngredientPicker } from './IngredientPicker';
import {
  type PendingRow,
  ResolveIngredientsSheet,
} from './ResolveIngredientsSheet';
import {
  emptyIngredientRow,
  emptyRecipeFormValues,
  type IngredientRowValues,
  type RecipeFormErrors,
  type RecipeFormValues,
  toRecipeInput,
} from './recipe-form-values';
import { TagChips } from './TagChips';
import './recipes.css';

export interface RecipeFormProps {
  /** Начални стойности: празна рецепта по подразбиране, `recipeToFormValues(recipe)` за редакция. */
  initialValues?: RecipeFormValues;
  /** Вика се само с валиден `RecipeInput` (по `recipeInputSchema`). */
  onSubmit: (input: RecipeInput) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  /** Грешка от записа (api), показва се над бутоните. */
  submitError?: unknown;
  onCancel?: () => void;
  /**
   * Одобрение на предложение: ако има редове без продукт, бутонът отваря диалог само с тях; записът тръгва от
   * диалога, когато всички са свързани или създадени.
   */
  requireResolvedIngredients?: boolean;
}

const NUTRITION_FIELDS = [
  ['kcal', 'Енергия (kcal)'],
  ['proteinG', 'Белтъчини (г)'],
  ['fatG', 'Мазнини (г)'],
  ['carbsG', 'Въглехидрати (г)'],
] as const;

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
}

/** Формата за нова рецепта и за редакция; без библиотека, валидация с `recipeInputSchema`. */
export function RecipeForm({
  initialValues,
  onSubmit,
  submitLabel = 'Запази',
  isSubmitting = false,
  submitError,
  onCancel,
  requireResolvedIngredients = false,
}: RecipeFormProps) {
  const [values, setValues] = useState<RecipeFormValues>(
    () => initialValues ?? emptyRecipeFormValues(),
  );
  const [errors, setErrors] = useState<RecipeFormErrors>({});
  /** Редовете в диалога за нови продукти; `null` = диалогът е затворен. */
  const [pending, setPending] = useState<PendingRow[] | null>(null);
  const closePending = useCallback(() => setPending(null), []);

  function set<K extends keyof RecipeFormValues>(
    key: K,
    value: RecipeFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateRow(index: number, patch: Partial<IngredientRowValues>) {
    setValues((current) => ({
      ...current,
      ingredients: current.ingredients.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function updateRowByKey(key: string, patch: Partial<IngredientRowValues>) {
    setValues((current) => ({
      ...current,
      ingredients: current.ingredients.map((row) =>
        row.key === key ? { ...row, ...patch } : row,
      ),
    }));
  }

  /** Избран продукт в реда; основната единица на продукта, освен ако вече има въведено количество. */
  function selected(
    row: IngredientRowValues,
    ingredient: Ingredient,
  ): Partial<IngredientRowValues> {
    return {
      ingredient,
      query: ingredient.name,
      ...(row.quantity.trim() === '' && row.unit !== 'pinch'
        ? { unit: ingredient.unit }
        : {}),
    };
  }

  function toggleTag(tag: Tag) {
    set(
      'tags',
      values.tags.includes(tag)
        ? values.tags.filter((t) => t !== tag)
        : [...values.tags, tag],
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const unresolved = values.ingredients.flatMap((row, index) =>
      row.ingredient === null ? [{ row, index }] : [],
    );
    const result = toRecipeInput(values);
    if (requireResolvedIngredients && unresolved.length > 0) {
      // Липсващият продукт се решава в диалога; останалите грешки се поправят първо във формата.
      const missing = new Set(
        unresolved.map(({ index }) => `ingredients.${index}.ingredientId`),
      );
      const rest = result.ok
        ? {}
        : Object.fromEntries(
            Object.entries(result.errors).filter(
              ([path]) => !missing.has(path),
            ),
          );
      setErrors(rest);
      if (Object.keys(rest).length === 0) {
        setPending(
          unresolved.map(({ row }) => ({
            key: row.key,
            name: row.query.trim() || 'Продукт без име',
          })),
        );
      }
      return;
    }
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.input);
  }

  function confirmPending() {
    const result = toRecipeInput(values);
    if (!result.ok) {
      setErrors(result.errors);
      setPending(null);
      return;
    }
    onSubmit(result.input);
  }

  return (
    <>
      <form className="recipe-form" noValidate onSubmit={submit}>
        <fieldset className="recipe-form__section">
          <legend>Основни</legend>
          <Field label="Заглавие" error={errors.title}>
            {(props) => (
              <input
                {...props}
                className="field__input"
                value={values.title}
                onChange={(event) => set('title', event.target.value)}
              />
            )}
          </Field>
          <div className="recipe-form__row">
            <Field label="Порции" error={errors.servings}>
              {(props) => (
                <input
                  {...props}
                  className="field__input"
                  inputMode="numeric"
                  value={values.servings}
                  onChange={(event) => set('servings', event.target.value)}
                />
              )}
            </Field>
            <Field label="Време (мин)" error={errors.prepMinutes}>
              {(props) => (
                <input
                  {...props}
                  className="field__input"
                  inputMode="numeric"
                  value={values.prepMinutes}
                  onChange={(event) => set('prepMinutes', event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label="Източник (линк)" error={errors.sourceUrl}>
            {(props) => (
              <input
                {...props}
                type="url"
                className="field__input"
                value={values.sourceUrl}
                onChange={(event) => set('sourceUrl', event.target.value)}
              />
            )}
          </Field>
          <span className="field__label">Тагове</span>
          <TagChips
            label="Тагове"
            selected={values.tags}
            onToggle={toggleTag}
          />
        </fieldset>

        <fieldset className="recipe-form__section">
          <legend>Хранителна стойност на 100 г (по избор)</legend>
          <div className="recipe-form__row">
            {NUTRITION_FIELDS.map(([key, label]) => (
              <Field
                key={key}
                label={label}
                error={errors[`nutritionPer100g.${key}`]}
              >
                {(props) => (
                  <input
                    {...props}
                    className="field__input"
                    inputMode="decimal"
                    value={values.nutrition[key]}
                    onChange={(event) =>
                      set('nutrition', {
                        ...values.nutrition,
                        [key]: event.target.value,
                      })
                    }
                  />
                )}
              </Field>
            ))}
          </div>
        </fieldset>

        <fieldset className="recipe-form__section recipe-form__wide">
          <legend>Продукти</legend>
          {values.ingredients.map((row, index) => (
            <fieldset
              key={row.key}
              className="recipe-form__item"
              aria-label={`Продукт ${index + 1}`}
            >
              <Field
                label="Продукт"
                error={errors[`ingredients.${index}.ingredientId`]}
              >
                {(props) => (
                  <IngredientPicker
                    inputProps={props}
                    ingredient={row.ingredient}
                    query={row.query}
                    unit={row.unit}
                    isNew={row.isNew}
                    onQueryChange={(query) =>
                      updateRow(index, { query, ingredient: null })
                    }
                    onSelect={(ingredient) =>
                      updateRow(index, selected(row, ingredient))
                    }
                  />
                )}
              </Field>
              <div className="recipe-form__row">
                <Field
                  label="Количество"
                  error={errors[`ingredients.${index}.quantity`]}
                >
                  {(props) => (
                    <input
                      {...props}
                      className="field__input"
                      inputMode="decimal"
                      disabled={row.unit === 'pinch'}
                      value={row.unit === 'pinch' ? '' : row.quantity}
                      onChange={(event) =>
                        updateRow(index, { quantity: event.target.value })
                      }
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
                        updateRow(index, {
                          unit: unitSchema.parse(event.target.value),
                        })
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
              <div className="recipe-form__item-tools">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Премахни продукт ${index + 1}`}
                  onClick={() =>
                    set(
                      'ingredients',
                      values.ingredients.filter((_, i) => i !== index),
                    )
                  }
                >
                  ✕ Премахни
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className="button button--quiet"
            onClick={() =>
              set('ingredients', [...values.ingredients, emptyIngredientRow()])
            }
          >
            Добави продукт
          </button>
        </fieldset>

        <fieldset className="recipe-form__section recipe-form__wide">
          <legend>Стъпки</legend>
          {errors.steps && <p className="field__error">{errors.steps}</p>}
          {values.steps.map((step, index) => {
            const number = index + 1;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: стъпките са само текст; редът е идентичността им.
              <div key={index} className="recipe-form__item">
                <Field
                  label={`Стъпка ${number}`}
                  error={errors[`steps.${index}`]}
                >
                  {(props) => (
                    <textarea
                      {...props}
                      className="field__input"
                      value={step}
                      onChange={(event) =>
                        set(
                          'steps',
                          values.steps.map((s, i) =>
                            i === index ? event.target.value : s,
                          ),
                        )
                      }
                    />
                  )}
                </Field>
                <div className="recipe-form__item-tools">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Нагоре: стъпка ${number}`}
                    disabled={index === 0}
                    onClick={() =>
                      set('steps', move(values.steps, index, index - 1))
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Надолу: стъпка ${number}`}
                    disabled={index === values.steps.length - 1}
                    onClick={() =>
                      set('steps', move(values.steps, index, index + 1))
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Премахни стъпка ${number}`}
                    onClick={() =>
                      set(
                        'steps',
                        values.steps.filter((_, i) => i !== index),
                      )
                    }
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="button button--quiet"
            onClick={() => set('steps', [...values.steps, ''])}
          >
            Добави стъпка
          </button>
        </fieldset>

        <div className="recipe-form__footer recipe-form__wide">
          {Object.keys(errors).length > 0 && (
            <p className="field__error" role="alert">
              Поправи отбелязаните полета.
            </p>
          )}
          {submitError !== undefined && submitError !== null && (
            <ErrorBox error={submitError} />
          )}
          <button type="submit" className="button" disabled={isSubmitting}>
            {submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              className="button button--quiet"
              onClick={onCancel}
            >
              Откажи
            </button>
          )}
        </div>
      </form>
      {pending && (
        <ResolveIngredientsSheet
          pending={pending}
          rows={values.ingredients}
          onQueryChange={(key, query) =>
            updateRowByKey(key, { query, ingredient: null })
          }
          onSelect={(key, ingredient) => {
            const row = values.ingredients.find((r) => r.key === key);
            if (row) {
              updateRowByKey(key, selected(row, ingredient));
            }
          }}
          onConfirm={confirmPending}
          onClose={closePending}
          confirmLabel={submitLabel}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}
    </>
  );
}
