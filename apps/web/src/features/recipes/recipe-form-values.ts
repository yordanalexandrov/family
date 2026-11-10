import {
  type BaseUnit,
  COMPONENT_NAME_MAX,
  COMPONENTS_MAX,
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
  type RecipeComponent,
  type RecipeInput,
  type RecipeStep,
  type RevisableRecipe,
  recipeComponentSchema,
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
  /** GLOSSARY: Компонент. Ключът на компонента на реда (`ComponentValues.key`); без него редът е от главните. */
  component?: string | undefined;
}

/** Един компонент (GLOSSARY: Компонент) във формата; редовете сочат към него с `key`. */
export interface ComponentValues {
  key: string;
  name: string;
  servings: string;
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
  /** GLOSSARY: Източник на рецепта. Поставеният текст на рецептата, само за четене; `null` без текст. */
  sourceText: string | null;
  /** „Махни“ под текста: записът праща `sourceText: null`. */
  removeSourceText: boolean;
  tags: Tag[];
  /** Името на уреда (GLOSSARY: Уред), както е в Настройки; празно = без уред. */
  appliance: string;
  /** Стъпките с текста им и снимката им, ако има: при местене и махане снимката върви със стъпката. */
  steps: RecipeStep[];
  /** GLOSSARY: Подготовка. Елементите в реда им, като в полетата. */
  preparation: PreparationItemValues[];
  /** GLOSSARY: Компонент. В реда им; редовете им са в `ingredients` с техния `key`. */
  components: ComponentValues[];
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
    sourceText: null,
    removeSourceText: false,
    tags: [],
    appliance: '',
    steps: [],
    preparation: [],
    components: [],
    ingredients: [],
    nutrition: nutritionToValues(undefined),
  };
}

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Компонентите (GLOSSARY: Компонент) на рецепта или предложение във формата, в реда им, всеки с нов ключ. */
export function componentsToValues(
  components: readonly RecipeComponent[],
): ComponentValues[] {
  return components.map((component) => ({
    key: newRowKey(),
    name: component.name,
    servings: String(component.servings),
  }));
}

/** `component` на реда във формата: ключът на компонента с индекс `index`; за главен ред (`null`) — нищо. */
export function lineComponent(
  components: readonly ComponentValues[],
  index: number | null,
): { component?: string } {
  const key = index === null ? undefined : components[index]?.key;
  return key === undefined ? {} : { component: key };
}

export function recipeToFormValues(recipe: Recipe): RecipeFormValues {
  const components = componentsToValues(recipe.components);
  return {
    title: recipe.title,
    servings: String(recipe.servings),
    prepMinutes: numberText(recipe.prepMinutes),
    sourceUrl: displaySourceUrl(recipe.sourceUrl ?? ''),
    sourceText: recipe.sourceText,
    removeSourceText: false,
    tags: [...recipe.tags],
    appliance: recipe.appliance ?? '',
    steps: recipe.steps.map((step) => ({ ...step })),
    preparation: preparationToValues(recipe.preparation),
    components,
    ingredients: recipe.ingredients.map((line) =>
      emptyIngredientRow({
        ingredient: line.ingredient,
        quantity: numberText(line.quantity),
        unit: line.unit,
        ...(line.note === undefined ? {} : { note: line.note }),
        ...lineComponent(components, line.component),
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
  [/^components$/, `Най-много ${COMPONENTS_MAX} компонента`],
  [/^components\.\d+$/, 'Компонентът е без продукти'],
  [/^components\.\d+\.name$/, `Въведи име, до ${COMPONENT_NAME_MAX} знака`],
  [/^components\.\d+\.servings$/, 'Порциите са цяло число, поне 1'],
];

function messageFor(path: string): string {
  return (
    FIELD_MESSAGES.find(([pattern]) => pattern.test(path))?.[1] ??
    'Невалидна стойност'
  );
}

/** Грешките на един компонент по поле (името, порциите), със същите думи като при запис; `{}` за верен. */
export function componentErrors(component: ComponentValues): {
  name?: string;
  servings?: string;
} {
  const [values] = valuesToComponents([component]);
  const result = recipeComponentSchema.safeParse(values);
  const errors: { name?: string; servings?: string } = {};
  for (const issue of result.error?.issues ?? []) {
    const field = issue.path[0];
    if (field === 'name' || field === 'servings') {
      errors[field] ??= messageFor(`components.0.${field}`);
    }
  }
  return errors;
}

/**
 * Полетата като рецептата, която „✏️ Поправи с AI“ праща от прегледа на предложение (формата не е записана): продуктите
 * по име, и несвързаните, всеки с компонента си; ред без продукт и без име отпада, а с него и компонент, който остава без
 * редове. `linked` казва за всеки ред дали е свързан с регистъра.
 * `undefined`, ако полетата не стават за поправка (напр. без порции или без стъпки).
 */
export function toRevisableRecipe(
  values: RecipeFormValues,
): { recipe: RevisableRecipe; linked: boolean[] } | undefined {
  const rows = values.ingredients.filter(
    (row) => row.ingredient !== null || row.query.trim() !== '',
  );
  const components = values.components.filter((component) =>
    rows.some((row) => row.component === component.key),
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
      component: componentIndex(components, row.component),
    })),
    steps: values.steps,
    preparation: valuesToPreparation(values.preparation),
    components: valuesToComponents(components),
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

/** Компонентите от формата за schema-та: порциите като число (`NaN`, докато не са число, за грешката по поле). */
function valuesToComponents(
  components: readonly ComponentValues[],
): { name: string; servings: number }[] {
  return components.map((component) => ({
    name: component.name,
    servings: parseNumber(component.servings) ?? Number.NaN,
  }));
}

/** Индексът на компонента с ключ `key` в `components`; `null` за главен ред (или компонент, който го няма). */
function componentIndex(
  components: readonly ComponentValues[],
  key: string | undefined,
): number | null {
  const index = components.findIndex((component) => component.key === key);
  return index === -1 ? null : index;
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
    // Само махането: без него api-то пази текста (GLOSSARY: Източник на рецепта).
    ...(values.removeSourceText && values.sourceText !== null
      ? { sourceText: null }
      : {}),
    ...(prepMinutes === undefined ? {} : { prepMinutes }),
    tags: values.tags,
    ...(values.appliance === '' ? {} : { appliance: values.appliance }),
    ...(nutritionPer100g ? { nutritionPer100g } : {}),
    preparation: valuesToPreparation(values.preparation),
    components: valuesToComponents(values.components),
    ingredients: values.ingredients.map((row) => ({
      ingredientId: row.ingredient?.id ?? '',
      quantity:
        row.unit === 'pinch' ? null : (parseNumber(row.quantity) ?? null),
      unit: row.unit,
      ...(row.note === undefined ? {} : { note: row.note }),
      component: componentIndex(values.components, row.component),
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
