import {
  type Ingredient,
  type Recipe,
  type RecipeInput,
  recipeInputSchema,
  type Tag,
  type Unit,
} from '@family/shared';

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
}

/** Стойностите на `RecipeForm` като текст, както са в полетата. */
export interface RecipeFormValues {
  title: string;
  servings: string;
  prepMinutes: string;
  sourceUrl: string;
  tags: Tag[];
  steps: string[];
  ingredients: IngredientRowValues[];
  nutrition: { kcal: string; proteinG: string; fatG: string; carbsG: string };
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
    steps: [''],
    ingredients: [],
    nutrition: { kcal: '', proteinG: '', fatG: '', carbsG: '' },
  };
}

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function recipeToFormValues(recipe: Recipe): RecipeFormValues {
  const nutrition = recipe.nutritionPer100g;
  return {
    title: recipe.title,
    servings: String(recipe.servings),
    prepMinutes: numberText(recipe.prepMinutes),
    sourceUrl: recipe.sourceUrl ?? '',
    tags: [...recipe.tags],
    steps: [...recipe.steps],
    ingredients: recipe.ingredients.map((line) =>
      emptyIngredientRow({
        ingredient: line.ingredient,
        quantity: numberText(line.quantity),
        unit: line.unit,
        ...(line.note === undefined ? {} : { note: line.note }),
      }),
    ),
    nutrition: {
      kcal: numberText(nutrition?.kcal),
      proteinG: numberText(nutrition?.proteinG),
      fatG: numberText(nutrition?.fatG),
      carbsG: numberText(nutrition?.carbsG),
    },
  };
}

/** Число от поле: празно е `undefined`, десетична запетая е позволена, нечисло е `NaN` (и schema-та го спира). */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : Number(trimmed.replace(',', '.'));
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

/** Полетата → `RecipeInput`, валидиран с `recipeInputSchema`; иначе грешки по поле на български. */
export function toRecipeInput(
  values: RecipeFormValues,
): { ok: true; input: RecipeInput } | { ok: false; errors: RecipeFormErrors } {
  const nutritionTexts = Object.values(values.nutrition);
  const hasNutrition = nutritionTexts.some((text) => text.trim() !== '');
  const prepMinutes = parseNumber(values.prepMinutes);
  const sourceUrl = values.sourceUrl.trim();

  const candidate = {
    title: values.title,
    servings: parseNumber(values.servings) ?? Number.NaN,
    steps: values.steps,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(prepMinutes === undefined ? {} : { prepMinutes }),
    tags: values.tags,
    ...(hasNutrition
      ? {
          nutritionPer100g: {
            kcal: parseNumber(values.nutrition.kcal) ?? Number.NaN,
            proteinG: parseNumber(values.nutrition.proteinG) ?? Number.NaN,
            fatG: parseNumber(values.nutrition.fatG) ?? Number.NaN,
            carbsG: parseNumber(values.nutrition.carbsG) ?? Number.NaN,
          },
        }
      : {}),
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
