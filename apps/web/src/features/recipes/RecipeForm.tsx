import {
  type RecipeInput,
  type Tag,
  UNIT_LABELS_BG,
  unitSchema,
} from '@family/shared';
import { type FormEvent, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from './Field';
import { IngredientPicker } from './IngredientPicker';
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
  /** Бутонът е блокиран, докато има ред без избран продукт (одобрение на предложение). */
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
  const unresolvedCount = values.ingredients.filter(
    (row) => row.ingredient === null,
  ).length;
  const blocked = requireResolvedIngredients && unresolvedCount > 0;

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
    const result = toRecipeInput(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.input);
  }

  return (
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
        <TagChips label="Тагове" selected={values.tags} onToggle={toggleTag} />
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
                    updateRow(index, {
                      ingredient,
                      query: ingredient.name,
                      // Основната единица на продукта, освен ако вече има въведено количество.
                      ...(row.quantity.trim() === '' && row.unit !== 'pinch'
                        ? { unit: ingredient.unit }
                        : {}),
                    })
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
        {blocked && (
          <p className="recipe-form__blocked">
            {unresolvedCount === 1
              ? 'Остава 1 продукт за свързване'
              : `Остават ${unresolvedCount} продукта за свързване`}
          </p>
        )}
        <button
          type="submit"
          className="button"
          disabled={isSubmitting || blocked}
        >
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
  );
}
