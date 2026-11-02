import {
  type BaseUnit,
  displaySourceUrl,
  type Ingredient,
  isSecondOvenIssue,
  MINUTES_BEFORE_MAX,
  type NewProduct,
  type Nutrition,
  normalizeSourceUrl,
  OVEN_DEGREES_MAX,
  OVEN_DEGREES_MIN,
  PREPARATION_MAX,
  type Recipe,
  type RecipeInput,
  type RecipeStep,
  type RevisableRecipe,
  recipeInputSchema,
  revisableRecipeSchema,
  type Tag,
  UNIT_LABELS_BG,
  type Unit,
} from '@family/shared';
import { formatQuantity } from '../../lib/format';
import {
  type PreparationItemValues,
  preparationToValues,
  valuesToPreparation,
} from '../preparation/preparation-values';

/**
 * Един ред продукт във формата. `ingredient: null` е неразрешен ред: има само текст в `query`
 * (напр. име от предложение), докато потребителят не избере или създаде продукт.
 */
export interface IngredientRowValues {
  key: string;
  ingredient: Ingredient | null;
  query: string;
  quantity: string;
  unit: Unit;
  note?: string;
  /** Продукт, който го няма в регистъра (от предложение): откроен като „нов продукт“, докато не се свърже. */
  isNew?: boolean;
  /** Новият продукт, както го предлага внасянето: попълва формата „Нов продукт“ (име, основна единица, щанд). */
  newProduct?: NewProduct;
}

/** Името на реда: продуктът от регистъра, иначе текстът, с който е дошъл. */
export function ingredientLineName(row: IngredientRowValues): string {
  return row.ingredient?.name ?? (row.query.trim() || 'Продукт без име');
}

/** Редът като един ред текст: „пилешко бутче · 4 бр.“, „сол · по вкус“; без количество — само името. */
export function ingredientLineText(row: IngredientRowValues): string {
  const quantity = parseNumber(row.quantity);
  const amount =
    quantity !== undefined && Number.isNaN(quantity)
      ? `${row.quantity.trim()} ${UNIT_LABELS_BG[row.unit]}`
      : formatQuantity({ quantity: quantity ?? null, unit: row.unit });
  const name = ingredientLineName(row);
  return amount === '' ? name : `${name} · ${amount}`;
}

/** Основната единица за нов продукт по единицата в рецептата: kg → g, l → ml; лъжиците и „по вкус“ → g. */
export function baseUnitFor(unit: Unit): BaseUnit {
  switch (unit) {
    case 'ml':
    case 'l':
      return 'ml';
    case 'pcs':
      return 'pcs';
    default:
      return 'g';
  }
}

/** Стойностите на `RecipeForm` като текст, както са в полетата. */
export interface RecipeFormValues {
  title: string;
  servings: string;
  prepMinutes: string;
  sourceUrl: string;
  tags: Tag[];
  /** Името на уреда (GLOSSARY: Уред), както е в Настройки; празно = без уред. */
  appliance: string;
  /** Стъпките с текста им и снимката им, ако има: при местене и махане снимката върви със стъпката. */
  steps: RecipeStep[];
  /** GLOSSARY: Подготовка. Елементите в реда им, като в полетата. */
  preparation: PreparationItemValues[];
  ingredients: IngredientRowValues[];
  nutrition: NutritionValues;
}

/** Полетата на хранителната стойност на 100 г, като текст; всички празни = без стойност. */
export type NutritionValues = Record<keyof Nutrition, string>;

const NUTRITION_KEYS = [
  'kcal',
  'proteinG',
  'fatG',
  'carbsG',
] as const satisfies readonly (keyof Nutrition)[];

/** Стойността на 100 г като текст в полетата; без стойност — празни полета. */
export function nutritionToValues(
  nutrition: Nutrition | undefined,
): NutritionValues {
  return {
    kcal: numberText(nutrition?.kcal),
    proteinG: numberText(nutrition?.proteinG),
    fatG: numberText(nutrition?.fatG),
    carbsG: numberText(nutrition?.carbsG),
  };
}

/** Грешки по поле: ключът е пътят в `RecipeInput` (`title`, `steps.1`, `ingredients.0.quantity`). */
export type RecipeFormErrors = Record<string, string>;

let nextRowKey = 0;

export function newRowKey(): string {
  nextRowKey += 1;
  return `row-${nextRowKey}`;
}

export function emptyIngredientRow(
  values: Partial<Omit<IngredientRowValues, 'key'>> = {},
): IngredientRowValues {
  return {
    key: newRowKey(),
    ingredient: null,
    query: values.ingredient?.name ?? '',
    quantity: '',
    unit: 'g',
    ...values,
  };
}

export function emptyRecipeFormValues(): RecipeFormValues {
  return {
    title: '',
    servings: '4',
    prepMinutes: '',
    sourceUrl: '',
    tags: [],
    appliance: '',
    steps: [],
    preparation: [],
    ingredients: [],
    nutrition: nutritionToValues(undefined),
  };
}

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function recipeToFormValues(recipe: Recipe): RecipeFormValues {
  return {
    title: recipe.title,
    servings: String(recipe.servings),
    prepMinutes: numberText(recipe.prepMinutes),
    sourceUrl: displaySourceUrl(recipe.sourceUrl ?? ''),
    tags: [...recipe.tags],
    appliance: recipe.appliance ?? '',
    steps: recipe.steps.map((step) => ({ ...step })),
    preparation: preparationToValues(recipe.preparation),
    ingredients: recipe.ingredients.map((line) =>
      emptyIngredientRow({
        ingredient: line.ingredient,
        quantity: numberText(line.quantity),
        unit: line.unit,
        ...(line.note === undefined ? {} : { note: line.note }),
      }),
    ),
    nutrition: nutritionToValues(recipe.nutritionPer100g),
  };
}

/** Число от поле: празно е `undefined`, десетична запетая е позволена, нечисло е `NaN` (и schema-та го спира). */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : Number(trimmed.replace(',', '.'));
}

/** Всички полета празни = без стойност; иначе празно поле е `NaN` и schema-та го спира. */
function valuesToNutrition(values: NutritionValues): Nutrition | undefined {
  if (NUTRITION_KEYS.every((key) => values[key].trim() === '')) {
    return undefined;
  }
  return Object.fromEntries(
    NUTRITION_KEYS.map((key) => [key, parseNumber(values[key]) ?? Number.NaN]),
  ) as Nutrition;
}

const MINUTES_PER_DAY = 24 * 60;

const FIELD_MESSAGES: [RegExp, string][] = [
  [/^title$/, 'Въведи заглавие'],
  [/^servings$/, 'Порциите са цяло число, поне 1'],
  [/^prepMinutes$/, 'Времето е цяло число минути'],
  [/^sourceUrl$/, 'Невалиден линк'],
  [/^steps$/, 'Добави поне една стъпка'],
  [/^steps\.\d+$/, 'Стъпката е празна'],
  [
    /^ingredients\.\d+\.ingredientId$/,
    'Избери продукт от списъка или създай нов',
  ],
  [/^ingredients\.\d+\.quantity$/, 'Количеството е положително число'],
  [/^preparation$/, `Най-много ${PREPARATION_MAX} неща в подготовката`],
  [
    /^preparation\.\d+\.degrees$/,
    `Градусите са цяло число от ${OVEN_DEGREES_MIN} до ${OVEN_DEGREES_MAX}`,
  ],
  [/^preparation\.\d+\.text$/, 'Напиши какво да се направи'],
  [
    /^preparation\.\d+\.minutesBefore$/,
    `Времето е от 1 мин до ${MINUTES_BEFORE_MAX / MINUTES_PER_DAY} дни`,
  ],
  [/^nutritionPer100g\.\w+$/, 'Неотрицателно число'],
];

function messageFor(path: string): string {
  return (
    FIELD_MESSAGES.find(([pattern]) => pattern.test(path))?.[1] ??
    'Невалидна стойност'
  );
}

/**
 * Полетата като рецептата, която „✏️ Поправи с AI“ праща от прегледа на предложение (формата не е записана): продуктите
 * по име, и несвързаните; ред без продукт и без име отпада. `linked` казва за всеки ред дали е свързан с регистъра.
 * `undefined`, ако полетата не стават за поправка (напр. без порции или без стъпки).
 */
export function toRevisableRecipe(
  values: RecipeFormValues,
): { recipe: RevisableRecipe; linked: boolean[] } | undefined {
  const rows = values.ingredients.filter(
    (row) => row.ingredient !== null || row.query.trim() !== '',
  );
  const result = revisableRecipeSchema.safeParse({
    title: values.title,
    servings: parseNumber(values.servings) ?? Number.NaN,
    prepMinutes: parseNumber(values.prepMinutes) ?? null,
    ingredients: rows.map((row) => ({
      name: ingredientLineName(row),
      quantity:
        row.unit === 'pinch' ? null : (parseNumber(row.quantity) ?? null),
      unit: row.unit,
      ...(row.note === undefined ? {} : { note: row.note }),
    })),
    steps: values.steps,
    preparation: valuesToPreparation(values.preparation),
  });
  return result.success
    ? {
        recipe: result.data,
        linked: rows.map((row) => row.ingredient !== null),
      }
    : undefined;
}

/** Грешките на един ред продукт от `toRecipeInput`, по поле. */
export function ingredientRowErrors(
  errors: RecipeFormErrors,
  index: number,
): { ingredientId?: string | undefined; quantity?: string | undefined } {
  return {
    ingredientId: errors[`ingredients.${index}.ingredientId`],
    quantity: errors[`ingredients.${index}.quantity`],
  };
}

/** Полетата → `RecipeInput`, валидиран с `recipeInputSchema`; иначе грешки по поле на български. */
export function toRecipeInput(
  values: RecipeFormValues,
): { ok: true; input: RecipeInput } | { ok: false; errors: RecipeFormErrors } {
  const nutritionPer100g = valuesToNutrition(values.nutrition);
  const prepMinutes = parseNumber(values.prepMinutes);
  // Полето показва линка четимо (`displaySourceUrl`); запазва се във вида, по който се сравнява (`normalizeSourceUrl`).
  const sourceUrl = normalizeSourceUrl(values.sourceUrl);

  const candidate = {
    title: values.title,
    servings: parseNumber(values.servings) ?? Number.NaN,
    steps: values.steps,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(prepMinutes === undefined ? {} : { prepMinutes }),
    tags: values.tags,
    ...(values.appliance === '' ? {} : { appliance: values.appliance }),
    ...(nutritionPer100g ? { nutritionPer100g } : {}),
    preparation: valuesToPreparation(values.preparation),
    ingredients: values.ingredients.map((row) => ({
      ingredientId: row.ingredient?.id ?? '',
      quantity:
        row.unit === 'pinch' ? null : (parseNumber(row.quantity) ?? null),
      unit: row.unit,
      ...(row.note === undefined ? {} : { note: row.note }),
    })),
  };

  const result = recipeInputSchema.safeParse(candidate);
  if (result.success) {
    return { ok: true, input: result.data };
  }
  const errors: RecipeFormErrors = {};
  for (const issue of result.error.issues) {
    // Грешката в текста на стъпка (`steps.1.text`) е на реда на стъпката (`steps.1`).
    const path = issue.path.join('.').replace(/^(steps\.\d+)\.text$/, '$1');
    // Втора фурна е грешка по `kind`, но не единствената възможна там.
    errors[path] ??= isSecondOvenIssue(issue)
      ? 'Фурната е само една'
      : messageFor(path);
  }
  return { ok: false, errors };
}
