import {
  type BaseUnit,
  displaySourceUrl,
  type Ingredient,
  type NewProduct,
  type Nutrition,
  normalizeSourceUrl,
  type Recipe,
  type RecipeInput,
  recipeInputSchema,
  type Tag,
  UNIT_LABELS_BG,
  type Unit,
} from '@family/shared';
import { formatQuantity } from '../../lib/format';

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
  steps: string[];
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
    steps: [...recipe.steps],
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
  [/^nutritionPer100g\.\w+$/, 'Неотрицателно число'],
];

function messageFor(path: string): string {
  return (
    FIELD_MESSAGES.find(([pattern]) => pattern.test(path))?.[1] ??
    'Невалидна стойност'
  );
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
    const path = issue.path.join('.');
    errors[path] ??= messageFor(path);
  }
  return { ok: false, errors };
}
