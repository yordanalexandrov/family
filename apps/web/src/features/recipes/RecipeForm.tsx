import type { Ingredient, RecipeInput, Tag } from '@family/shared';
import { type FormEvent, useCallback, useId, useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { IngredientLineSheet } from './IngredientLineSheet';
import {
  emptyIngredientRow,
  emptyRecipeFormValues,
  type IngredientRowValues,
  ingredientLineName,
  ingredientLineText,
  ingredientRowErrors,
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
   * Одобрение на предложение: редовете без продукт чакат свързване в листа на реда; бутонът не праща, докато ги
   * има, и казва кои са.
   */
  requireResolvedIngredients?: boolean;
}

const INGREDIENT_ID_PATH = /^ingredients\.\d+\.ingredientId$/;

/** Името на предложения нов продукт на реда, за сравнение без значение от главни букви. */
function newProductKey(row: IngredientRowValues): string | undefined {
  return row.newProduct?.name.trim().toLocaleLowerCase('bg');
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
  /** Редът в отворения лист; `added` = нов ред от „Добави продукт“, който се маха, ако се затвори празен. */
  const [editing, setEditing] = useState<{
    key: string;
    added: boolean;
  } | null>(null);
  const errorIdPrefix = useId();
  const closeEditing = useCallback(() => {
    if (editing?.added) {
      setValues((current) => ({
        ...current,
        ingredients: current.ingredients.filter(
          (row) =>
            row.key !== editing.key ||
            row.ingredient !== null ||
            row.query.trim() !== '' ||
            row.quantity.trim() !== '',
        ),
      }));
    }
    setEditing(null);
  }, [editing]);

  function set<K extends keyof RecipeFormValues>(
    key: K,
    value: RecipeFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
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

  /**
   * Продукт, създаден от един ред, свързва и другите несвързани редове със същия предложен нов продукт (напр. за блат
   * и крем).
   */
  function linkSameNewProduct(key: string, ingredient: Ingredient) {
    const source = values.ingredients.find((row) => row.key === key);
    const name = source && newProductKey(source);
    if (name === undefined) {
      return;
    }
    for (const row of values.ingredients) {
      if (
        row.key !== key &&
        row.ingredient === null &&
        newProductKey(row) === name
      ) {
        updateRowByKey(row.key, selected(row, ingredient));
      }
    }
  }

  function addIngredient() {
    const row = emptyIngredientRow();
    set('ingredients', [...values.ingredients, row]);
    setEditing({ key: row.key, added: true });
  }

  function removeIngredient(key: string) {
    set(
      'ingredients',
      values.ingredients.filter((row) => row.key !== key),
    );
    // Грешките са по индекс на реда; след махане биха паднали под друг ред.
    setErrors({});
    setEditing(null);
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

  const lines = values.ingredients.map((row, index) => ({ row, index }));
  // Редовете, които искат действие, са отгоре; записът пази реда на рецептата.
  const orderedLines = [
    ...lines.filter(({ row }) => row.ingredient === null),
    ...lines.filter(({ row }) => row.ingredient !== null),
  ];
  const waiting = values.ingredients.filter((row) => row.ingredient === null);
  const errorPaths = Object.keys(errors);
  const waitingAlert =
    requireResolvedIngredients &&
    waiting.length > 0 &&
    errorPaths.some((path) => INGREDIENT_ID_PATH.test(path));
  const fieldAlert = errorPaths.some(
    (path) => !requireResolvedIngredients || !INGREDIENT_ID_PATH.test(path),
  );
  const editingIndex = editing
    ? values.ingredients.findIndex((row) => row.key === editing.key)
    : -1;
  const editingRow = values.ingredients[editingIndex];

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
          <ul className="ingredient-lines" aria-label="Продукти">
            {orderedLines.map(({ row, index }) => {
              const rowErrors = ingredientRowErrors(errors, index);
              const error =
                (row.ingredient === null
                  ? rowErrors.ingredientId
                  : undefined) ?? rowErrors.quantity;
              const errorId = `${errorIdPrefix}-${row.key}-error`;
              const open = () => setEditing({ key: row.key, added: false });
              return (
                <li
                  key={row.key}
                  className={
                    row.ingredient === null
                      ? 'ingredient-line ingredient-line--unresolved'
                      : 'ingredient-line'
                  }
                >
                  <button
                    type="button"
                    className="ingredient-line__open"
                    aria-describedby={error === undefined ? undefined : errorId}
                    onClick={open}
                  >
                    {ingredientLineText(row)}
                  </button>
                  {row.ingredient ? (
                    <span
                      className="ingredient-line__linked"
                      role="img"
                      aria-label="Свързан"
                    >
                      ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button ingredient-line__link"
                      aria-label={`Свържи „${ingredientLineName(row)}“`}
                      onClick={open}
                    >
                      Свържи
                    </button>
                  )}
                  {error !== undefined && (
                    <p
                      className="field__error ingredient-line__error"
                      id={errorId}
                    >
                      {error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="button button--quiet"
            onClick={addIngredient}
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
          {(waitingAlert || fieldAlert) && (
            <p className="field__error" role="alert">
              {waitingAlert &&
                `Чака свързване: ${waiting.map(ingredientLineName).join(', ')}.`}
              {waitingAlert && fieldAlert && ' '}
              {fieldAlert && 'Поправи отбелязаните полета.'}
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
      {editing && editingRow && (
        <IngredientLineSheet
          row={editingRow}
          errors={ingredientRowErrors(errors, editingIndex)}
          onChange={(patch) => updateRowByKey(editingRow.key, patch)}
          onSelect={(ingredient) =>
            updateRowByKey(editingRow.key, selected(editingRow, ingredient))
          }
          onCreated={(ingredient) =>
            linkSameNewProduct(editingRow.key, ingredient)
          }
          onRemove={() => removeIngredient(editingRow.key)}
          onClose={closeEditing}
        />
      )}
    </>
  );
}
