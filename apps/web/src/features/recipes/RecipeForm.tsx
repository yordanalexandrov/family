import type {
  Ingredient,
  Preparation,
  RecipeInput,
  RecipeStep,
  Tag,
} from '@family/shared';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Action, ActionBar } from '../../components/ActionBar';
import { ErrorBox } from '../../components/ErrorBox';
import { Field } from '../../components/Field';
import { applianceShortName, useAppliances } from '../appliances/queries';
import { PreparationField } from '../preparation/PreparationField';
import { preparationToValues } from '../preparation/preparation-values';
import { StepPhotoImage } from '../step-photos/StepPhotoThumbnail';
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
import { StepSheet } from './StepSheet';
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
   * Одобрение на предложение: редовете без продукт чакат свързване в листа на реда; лентата казва колко са, а
   * основното действие отваря листа на първия, вместо да праща.
   */
  requireResolvedIngredients?: boolean;
  /** Още тихи действия в лентата преди „Откажи“, напр. „Отхвърли“ при преглед. */
  extraActions?: readonly Action[];
  /** Основното действие на лентата на мястото на записа, напр. „Отвори“ при рецепта със същото заглавие. */
  primaryAction?: Action | undefined;
  /** Заглавието при всяка промяна, напр. за проверката за рецепта със същото заглавие при преглед. */
  onTitleChange?: (title: string) => void;
  /** Изборът в „Уред“ се смени (`''` = „Без уред“), напр. за значката над формата при преглед. */
  onApplianceChange?: (appliance: string) => void;
  /**
   * AI действията под заглавието „Стъпки“, напр. „✨ Подобри рецептата“ и „✏️ Поправи с AI“ в редакцията; като функция
   * получава полетата, както са сега (напр. „✏️ Поправи с AI“ при преглед праща незаписаната форма).
   */
  aiActions?: ReactNode | ((values: RecipeFormValues) => ReactNode);
  /**
   * Прието подобрение (GLOSSARY: Подобряване на рецепта) или поправка (GLOSSARY: Поправка на рецепта): заменя стъпките и
   * подготовката, попълва времето, ако го има, а поправката — и порциите и продуктите, веднъж за всеки нов `key`;
   * другите полета, и незапазените промени в тях, остават. Рецептата се променя при „Запази“.
   */
  aiReplacement?: AiReplacement | undefined;
}

/**
 * Каквото прието подобрение или поправка слага във формата наведнъж: стъпките и подготовката, и времето, порциите и
 * продуктите, ако ги има.
 */
export interface AiReplacement {
  /** Нов номер = ново подобрение за прилагане. */
  key: number;
  steps: RecipeStep[];
  /** Цялата подготовка: заменя сегашната, и `[]` я маха; `undefined` (подобрение отпреди подготовката) не я пипа. */
  preparation?: Preparation | undefined;
  prepMinutes?: number | undefined;
  /** Порциите от поправка; `undefined` не ги пипа. */
  servings?: number | undefined;
  /** Всички продукти от поправка (новите неразрешени, за свързване); `undefined` не ги пипа. */
  ingredients?: IngredientRowValues[] | undefined;
}

function isNutritionPath(path: string): boolean {
  return path.startsWith('nutritionPer100g.');
}

const INGREDIENT_ID_PATH = /^ingredients\.\d+\.ingredientId$/;

/** Името на предложения нов продукт на реда, за сравнение без значение от главни букви. */
function newProductKey(row: IngredientRowValues): string | undefined {
  return row.newProduct?.name.trim().toLocaleLowerCase('bg');
}

/** „1 продукт за свързване“, „2 продукта за свързване“. */
function waitingText(count: number): string {
  return `${count} ${count === 1 ? 'продукт' : 'продукта'} за свързване`;
}

const NUTRITION_FIELDS = [
  ['kcal', 'Енергия (kcal)'],
  ['proteinG', 'Белтъчини (г)'],
  ['fatG', 'Мазнини (г)'],
  ['carbsG', 'Въглехидрати (г)'],
] as const;

/** Стъпката с нова снимка или без снимка (`undefined`), без празно поле `photoId`. */
function withPhoto(step: RecipeStep, photoId: string | undefined): RecipeStep {
  const { photoId: _old, ...rest } = step;
  return photoId === undefined ? rest : { ...rest, photoId };
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
}

/**
 * Грешките по редове на списък (`steps.<n>`, `ingredients.<n>.<поле>`) са по индекс: след местене или махане минават
 * под новия индекс на реда си (`undefined` = редът го няма). Другите грешки остават.
 */
function reindexErrors(
  errors: RecipeFormErrors,
  list: 'steps' | 'ingredients' | 'preparation',
  newIndex: (index: number) => number | undefined,
): RecipeFormErrors {
  const pattern = new RegExp(`^${list}\\.(\\d+)(\\..+)?$`);
  const next: RecipeFormErrors = {};
  for (const [path, message] of Object.entries(errors)) {
    const match = pattern.exec(path);
    if (!match) {
      next[path] = message;
      continue;
    }
    const index = newIndex(Number(match[1]));
    if (index !== undefined) {
      next[`${list}.${index}${match[2] ?? ''}`] = message;
    }
  }
  return next;
}

/** Отбелязаните грешки, чиито полета `values` още не поправят; нова грешка излиза чак при следващото „Запази“. */
function stillFailing(
  flagged: RecipeFormErrors,
  values: RecipeFormValues,
): RecipeFormErrors {
  if (Object.keys(flagged).length === 0) {
    return flagged;
  }
  const result = toRecipeInput(values);
  if (result.ok) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(flagged).filter(([path]) => path in result.errors),
  );
}

/** Грешките на подготовката без `preparation.` отпред; грешката на целия списък е под `''`. */
function preparationErrors(errors: RecipeFormErrors): RecipeFormErrors {
  return Object.fromEntries(
    Object.entries(errors).flatMap(([path, message]) =>
      path === 'preparation'
        ? [['', message]]
        : path.startsWith('preparation.')
          ? [[path.slice('preparation.'.length), message]]
          : [],
    ),
  );
}

/** Новият индекс на ред след махането на `removed`. */
function afterRemoving(removed: number) {
  return (index: number) =>
    index === removed ? undefined : index > removed ? index - 1 : index;
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
  extraActions = [],
  primaryAction,
  onTitleChange,
  onApplianceChange,
  aiActions,
  aiReplacement,
}: RecipeFormProps) {
  const [values, setValues] = useState<RecipeFormValues>(
    () => initialValues ?? emptyRecipeFormValues(),
  );
  const [replacedKey, setReplacedKey] = useState(aiReplacement?.key);
  if (aiReplacement && aiReplacement.key !== replacedKey) {
    setReplacedKey(aiReplacement.key);
    setValues((current) => ({
      ...current,
      steps: aiReplacement.steps.map((step) => ({ ...step })),
      ...(aiReplacement.preparation === undefined
        ? {}
        : { preparation: preparationToValues(aiReplacement.preparation) }),
      ...(aiReplacement.prepMinutes === undefined
        ? {}
        : { prepMinutes: String(aiReplacement.prepMinutes) }),
      ...(aiReplacement.servings === undefined
        ? {}
        : { servings: String(aiReplacement.servings) }),
      ...(aiReplacement.ingredients === undefined
        ? {}
        : { ingredients: aiReplacement.ingredients }),
    }));
  }
  /**
   * Грешките на клиентската проверка от последното „Запази“ (тази от сървъра е `submitError`); показват се само докато
   * полето им още не минава проверката.
   */
  const [flagged, setFlagged] = useState<RecipeFormErrors>({});
  const errors = useMemo(
    () => stillFailing(flagged, values),
    [flagged, values],
  );
  const appliances = useAppliances();
  // Всички уреди, и изключените; уред, махнат от Настройки, остава избран, докато не се смени.
  const applianceNames = appliances.data?.map((a) => a.name) ?? [];
  if (values.appliance !== '' && !applianceNames.includes(values.appliance)) {
    applianceNames.push(values.appliance);
  }
  /** Редът в отворения лист; `added` = нов ред от „Добави продукт“, който се маха, ако се затвори празен. */
  const [editing, setEditing] = useState<{
    key: string;
    added: boolean;
  } | null>(null);
  /** Стъпката в отворения лист; `added` = нова от „Добави стъпка“, която се маха, ако се затвори празна. */
  const [editingStep, setEditingStep] = useState<{
    index: number;
    added: boolean;
  } | null>(null);
  /** Хранителната стойност е разгъната отначало, ако рецептата идва с такава. */
  const [hasNutrition] = useState(() =>
    Object.values(values.nutrition).some((value) => value.trim() !== ''),
  );
  const nutritionRef = useRef<HTMLDetailsElement>(null);
  const errorIdPrefix = useId();
  const formId = useId();
  // Листът мести фокуса на „Готово“ при нов `onClose`; местенето сменя индекса, затова затварянето чете ref.
  const editingStepRef = useRef(editingStep);
  editingStepRef.current = editingStep;
  const stepsRef = useRef(values.steps);
  stepsRef.current = values.steps;
  const closeStep = useCallback(() => {
    const step = editingStepRef.current;
    if (step?.added && stepsRef.current[step.index]?.text.trim() === '') {
      const removed = step.index;
      setValues((current) => ({
        ...current,
        steps: current.steps.filter((_, index) => index !== removed),
      }));
      setFlagged((current) =>
        reindexErrors(current, 'steps', afterRemoving(removed)),
      );
    }
    setEditingStep(null);
  }, []);
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
    const removed = values.ingredients.findIndex((row) => row.key === key);
    set(
      'ingredients',
      values.ingredients.filter((row) => row.key !== key),
    );
    setFlagged((current) =>
      reindexErrors(current, 'ingredients', afterRemoving(removed)),
    );
    setEditing(null);
  }

  function addStep() {
    set('steps', [...values.steps, { text: '' }]);
    setEditingStep({ index: values.steps.length, added: true });
  }

  function moveStep(from: number, to: number) {
    set('steps', move(values.steps, from, to));
    const order = move(
      values.steps.map((_, index) => index),
      from,
      to,
    );
    setFlagged((current) =>
      reindexErrors(current, 'steps', (index) => order.indexOf(index)),
    );
    setEditingStep((current) => current && { ...current, index: to });
  }

  function removeStep(index: number) {
    set(
      'steps',
      values.steps.filter((_, i) => i !== index),
    );
    setFlagged((current) =>
      reindexErrors(current, 'steps', afterRemoving(index)),
    );
    setEditingStep(null);
  }

  function toggleTag(tag: Tag) {
    set(
      'tags',
      values.tags.includes(tag)
        ? values.tags.filter((t) => t !== tag)
        : [...values.tags, tag],
    );
  }

  /** „Одобри“/„Запази“ в лентата и Enter в поле: и двете пращат формата. */
  function submit(event: FormEvent) {
    event.preventDefault();
    const [first] = waiting;
    if (first) {
      // Одобрението чака свързване: води към първия ред, който го спира.
      setEditing({ key: first.key, added: false });
      return;
    }
    const result = toRecipeInput(values);
    if (!result.ok) {
      setFlagged(result.errors);
      if (
        Object.keys(result.errors).some(isNutritionPath) &&
        nutritionRef.current
      ) {
        nutritionRef.current.open = true;
      }
      return;
    }
    setFlagged({});
    onSubmit(result.input);
  }

  const lines = values.ingredients.map((row, index) => ({ row, index }));
  // Редовете, които искат действие, са отгоре; записът пази реда на рецептата.
  const orderedLines = [
    ...lines.filter(({ row }) => row.ingredient === null),
    ...lines.filter(({ row }) => row.ingredient !== null),
  ];
  const waiting = requireResolvedIngredients
    ? values.ingredients.filter((row) => row.ingredient === null)
    : [];
  // Несвързаните редове се свързват в листа си; полетата с грешки остават за алармата.
  const fieldAlert = Object.keys(errors).some(
    (path) => !requireResolvedIngredients || !INGREDIENT_ID_PATH.test(path),
  );
  const editingIndex = editing
    ? values.ingredients.findIndex((row) => row.key === editing.key)
    : -1;
  const editingRow = values.ingredients[editingIndex];

  return (
    <>
      <form id={formId} className="recipe-form" noValidate onSubmit={submit}>
        <fieldset className="recipe-form__section">
          <legend>Основни</legend>
          <Field label="Заглавие" error={errors.title}>
            {(props) => (
              <input
                {...props}
                className="field__input"
                value={values.title}
                onChange={(event) => {
                  set('title', event.target.value);
                  onTitleChange?.(event.target.value);
                }}
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
          <Field label="Уред" error={errors.appliance}>
            {(props) => (
              <select
                {...props}
                className="field__input"
                value={values.appliance}
                onChange={(event) => {
                  set('appliance', event.target.value);
                  onApplianceChange?.(event.target.value);
                }}
              >
                <option value="">Без уред</option>
                {applianceNames.map((name) => (
                  <option key={name} value={name}>
                    {applianceShortName(name)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <span className="field__label">Тагове</span>
          <TagChips
            label="Тагове"
            selected={values.tags}
            onToggle={toggleTag}
          />
        </fieldset>

        <PreparationField
          items={values.preparation}
          errors={preparationErrors(errors)}
          onChange={(preparation, reindex) => {
            set('preparation', preparation);
            if (reindex) {
              setFlagged((current) =>
                reindexErrors(current, 'preparation', reindex),
              );
            }
          }}
        />

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
          {typeof aiActions === 'function' ? aiActions(values) : aiActions}
          {errors.steps && <p className="field__error">{errors.steps}</p>}
          <ol className="step-lines" aria-label="Стъпки">
            {values.steps.map((step, index) => {
              const error = errors[`steps.${index}`];
              const errorId = `${errorIdPrefix}-step-${index}-error`;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: стъпките нямат id; редът е идентичността им.
                <li key={index} className="step-line">
                  <button
                    type="button"
                    className="step-line__open"
                    aria-describedby={error === undefined ? undefined : errorId}
                    onClick={() => setEditingStep({ index, added: false })}
                  >
                    <span className="step-line__text">
                      {step.text.trim() || 'Празна стъпка'}
                    </span>
                    {step.photoId && (
                      <StepPhotoImage photoId={step.photoId} label="" />
                    )}
                  </button>
                  {error !== undefined && (
                    <p className="field__error step-line__error" id={errorId}>
                      {error}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="button button--quiet"
            onClick={addStep}
          >
            Добави стъпка
          </button>
        </fieldset>

        <details
          className="recipe-form__section recipe-form__wide recipe-form__more"
          ref={nutritionRef}
          // Само началното състояние: после е на човека, а запис с грешка тук само разгъва.
          open={hasNutrition}
        >
          <summary className="recipe-form__more-summary">
            Хранителна стойност
          </summary>
          <p className="recipe-form__hint">На 100 г, по избор.</p>
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
        </details>
      </form>
      <ActionBar
        text={
          !primaryAction && waiting.length > 0
            ? waitingText(waiting.length)
            : undefined
        }
        primary={
          primaryAction ?? {
            label: submitLabel,
            form: formId,
            disabled: isSubmitting,
          }
        }
        secondary={[
          ...extraActions,
          ...(onCancel ? [{ label: 'Откажи', onClick: onCancel }] : []),
        ]}
      >
        {fieldAlert && (
          <p className="field__error" role="alert">
            Поправи отбелязаните полета.
          </p>
        )}
        {submitError !== undefined && submitError !== null && (
          <ErrorBox error={submitError} />
        )}
      </ActionBar>
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
      {editingStep && editingStep.index < values.steps.length && (
        <StepSheet
          number={editingStep.index + 1}
          count={values.steps.length}
          text={values.steps[editingStep.index]?.text ?? ''}
          photoId={values.steps[editingStep.index]?.photoId}
          error={errors[`steps.${editingStep.index}`]}
          onChange={(text) =>
            set(
              'steps',
              values.steps.map((s, i) =>
                i === editingStep.index ? { ...s, text } : s,
              ),
            )
          }
          onPhotoChange={(photoId) =>
            setValues((current) => ({
              ...current,
              steps: current.steps.map((s, i) =>
                i === editingStep.index ? withPhoto(s, photoId) : s,
              ),
            }))
          }
          onMoveUp={() => moveStep(editingStep.index, editingStep.index - 1)}
          onMoveDown={() => moveStep(editingStep.index, editingStep.index + 1)}
          onRemove={() => removeStep(editingStep.index)}
          onClose={closeStep}
        />
      )}
    </>
  );
}
