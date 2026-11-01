import {
  type AppliedChange,
  appliedChangesSchema,
  applyCookingChanges,
  type DateKey,
  dateKeyInSofia,
  lastCookingAppliedSchema,
  type Recipe,
  type RememberedQuestion,
  recipeCookingLines,
  rememberedQuestionsSchema,
} from '@family/shared';
import { useRef, useState } from 'react';
import { storedSetting } from '../../app/stored-setting';
import { logger } from '../../logger';

export const COOKING_PROGRESS_KEY = 'family.cooking.progress';
export const COOKING_INGREDIENTS_OPEN_KEY = 'family.cooking.ingredientsOpen';
export const COOKING_TEXT_SIZE_KEY = 'family.cooking.textSize';
export const COOKING_READ_STEPS_KEY = 'family.cooking.readSteps';

/**
 * Докъдето е стигнало Готвене за една рецепта: индексът на стъпката, на отметнатите редове продукти и кои елементи от
 * подготовката са направени (по един на елемент, в реда на рецептата).
 */
export interface CookingProgress {
  step: number;
  used: readonly number[];
  prepared: readonly boolean[];
}

export type { AppliedChange, RememberedQuestion } from '@family/shared';

/**
 * Записът на една рецепта на устройството: напредъкът (отметките на подготовката важат само за подготовката
 * `preparedFor`), въпросите в Готвене по реда на задаване, приложените промени за готвенето по реда на прилагане и
 * „последното готвене“ (`lastApplied`: id-тата на въпросите с приложени промени при „Готово“). Полетата се пишат
 * поотделно и всяко може да липсва.
 */
interface StoredRecipeProgress extends CookingProgress {
  preparedFor: string;
  questions: readonly RememberedQuestion[];
  applied: readonly AppliedChange[];
  lastApplied: readonly string[];
}

/** Записът на устройството: напредъкът по рецепта за един ден; запис от друг ден не важи. */
interface StoredProgress {
  day: DateKey;
  recipes: Record<string, StoredRecipeProgress>;
}

/** Отпечатъкът на подготовката: друга подготовка (рецептата е променена) прави старите отметки невалидни. */
function preparationKey(recipe: Recipe): string {
  return JSON.stringify(recipe.preparation);
}

function start(recipe: Recipe): CookingProgress {
  return { step: 0, used: [], prepared: recipe.preparation.map(() => false) };
}

function today(): DateKey {
  return dateKeyInSofia(new Date());
}

/** Днешният запис; липсващ, стар, повреден или недостъпен localStorage — празен. */
function readStored(): StoredProgress {
  const empty = { day: today(), recipes: {} };
  try {
    const raw = localStorage.getItem(COOKING_PROGRESS_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<StoredProgress>) : null;
    if (
      stored?.day !== empty.day ||
      typeof stored.recipes !== 'object' ||
      stored.recipes === null
    ) {
      return empty;
    }
    return { day: empty.day, recipes: stored.recipes };
  } catch (error) {
    logger.warn('Напредъкът в Готвене не се прочете', error);
    return empty;
  }
}

/** Днешният запис на рецептата с `recipeId`; липсващ — празен. */
function readRecipe(recipeId: string): Partial<StoredRecipeProgress> {
  const saved: unknown = readStored().recipes[recipeId];
  return typeof saved === 'object' && saved !== null ? saved : {};
}

/** Как се чете запомнен списък: целият или нищо (schema-та от shared). */
interface ListSchema<Item> {
  safeParse(
    value: unknown,
  ): { success: true; data: Item[] } | { success: false };
}

/** Запомнените списъци в записа на рецептата и как се четат. */
const LISTS = {
  questions: rememberedQuestionsSchema,
  applied: appliedChangesSchema,
  lastApplied: lastCookingAppliedSchema,
} satisfies {
  [Field in 'questions' | 'applied' | 'lastApplied']: ListSchema<
    StoredRecipeProgress[Field][number]
  >;
};

/** Списъкът `field` от записа на рецептата; липсващ или повреден (някой елемент не пасва) — празен. */
function listOf<Item>(
  saved: Partial<StoredRecipeProgress>,
  field: keyof typeof LISTS,
  schema: ListSchema<Item>,
): readonly Item[] {
  const parsed = schema.safeParse(saved[field]);
  return parsed.success ? parsed.data : [];
}

/**
 * Запазеният днес напредък за `recipe`, ако още пасва на стъпките, продуктите (с приложените промени) и подготовката
 * ѝ.
 */
function readProgress(recipe: Recipe): CookingProgress {
  const saved = readRecipe(recipe.id);
  const lines = applyCookingChanges(
    recipeCookingLines(recipe),
    listOf(saved, 'applied', LISTS.applied),
  ).length;
  const { step, used, prepared, preparedFor } = saved;
  const isIndex = (value: unknown, length: number): value is number =>
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < length;
  return {
    step: isIndex(step, recipe.steps.length) ? step : 0,
    used: Array.isArray(used)
      ? [...new Set(used.filter((index) => isIndex(index, lines)))]
      : [],
    // Отметки от друга подготовка (рецептата е променена) започват отначало.
    prepared:
      preparedFor === preparationKey(recipe) &&
      Array.isArray(prepared) &&
      prepared.length === recipe.preparation.length &&
      prepared.every((done) => typeof done === 'boolean')
        ? prepared
        : start(recipe).prepared,
  };
}

/**
 * Сменя днешния запис на рецептата с `recipeId`: `change` получава сегашния (или празен) и връща новия; без
 * `change` записът се трие.
 */
function updateRecipe(
  recipeId: string,
  change?: (
    current: Partial<StoredRecipeProgress>,
  ) => Partial<StoredRecipeProgress>,
): void {
  // Записът е само за днес: преминаването в нов ден изхвърля записите на всички рецепти.
  const stored = readStored();
  if (change) {
    const current: unknown = stored.recipes[recipeId];
    stored.recipes[recipeId] = change(
      typeof current === 'object' && current !== null ? current : {},
    ) as StoredRecipeProgress;
  } else {
    delete stored.recipes[recipeId];
  }
  try {
    localStorage.setItem(COOKING_PROGRESS_KEY, JSON.stringify(stored));
  } catch (error) {
    logger.warn('Напредъкът в Готвене не се записа', error);
  }
}

/** Записва напредъка по рецептата за днес; без `progress` трие целия ѝ запис, с въпросите. */
function writeProgress(recipe: Recipe, progress?: CookingProgress): void {
  updateRecipe(
    recipe.id,
    progress &&
      ((current) => ({
        ...current,
        ...progress,
        preparedFor: preparationKey(recipe),
      })),
  );
}

/**
 * Стъпката, отметките на продуктите и на подготовката в Готвене за `recipe`, запомнени на устройството до края на деня (по софийско време).
 * `finish` („Готово“) ги забравя заедно с въпросите и приложените промени, така че ново влизане същия ден започва
 * отначало; остава само последното готвене (`rememberLastCooking`). Нищо не стига до сървъра; без localStorage
 * Готвене работи без памет.
 */
export function useCookingProgress(recipe: Recipe) {
  const [progress, setProgress] = useState(() => readProgress(recipe));
  const update = (next: CookingProgress) => {
    setProgress(next);
    writeProgress(recipe, next);
  };
  return {
    step: progress.step,
    used: progress.used,
    setStep: (step: number) => update({ ...progress, step }),
    toggleUsed: (index: number) =>
      update({
        ...progress,
        used: progress.used.includes(index)
          ? progress.used.filter((other) => other !== index)
          : [...progress.used, index],
      }),
    prepared: progress.prepared,
    /** Махат се отметките на тези редове (промяна за готвенето ги е сменила). */
    forgetUsed: (indices: readonly number[]) =>
      update({
        ...progress,
        used: progress.used.filter((index) => !indices.includes(index)),
      }),
    togglePrepared: (index: number) =>
      update({
        ...progress,
        prepared: progress.prepared.map((done, other) =>
          other === index ? !done : done,
        ),
      }),
    finish: () =>
      updateRecipe(recipe.id, (current) => {
        const lastApplied = listOf(current, 'lastApplied', LISTS.lastApplied);
        return lastApplied.length > 0 ? { lastApplied } : {};
      }),
  };
}

/**
 * „Готово“: приложените промени за готвенето на рецептата (id-тата на въпросите им, по реда на прилагане) остават на
 * устройството като последното готвене до края на деня, и след `finish`.
 */
export function rememberLastCooking(
  recipeId: string,
  applied: readonly string[],
): void {
  updateRecipe(recipeId, (current) => ({ ...current, lastApplied: applied }));
}

/**
 * `applied` на поправка от „Как мина?“: приложените промени от последното готвене на рецептата на това устройство днес;
 * от вчера или без такова — няма.
 */
export function lastCookingApplied(recipeId: string): readonly string[] {
  return listOf(readRecipe(recipeId), 'lastApplied', LISTS.lastApplied);
}

/**
 * Списъкът `field` от записа на рецептата на това устройство, по реда на добавяне: помни се в записа на напредъка
 * (`useCookingProgress`), до края на деня или до „Готово“. `update` смята новия списък от последния, дори между две
 * изобразявания.
 */
function useRememberedList<Item>(
  recipeId: string,
  field: keyof typeof LISTS,
  schema: ListSchema<Item>,
) {
  const [list, setList] = useState(() =>
    listOf(readRecipe(recipeId), field, schema),
  );
  const latest = useRef(list);
  return {
    list,
    update(change: (current: readonly Item[]) => readonly Item[]) {
      const next = change(latest.current);
      latest.current = next;
      setList(next);
      updateRecipe(recipeId, (current) => ({ ...current, [field]: next }));
    },
  };
}

/** Въпросите в Готвене по рецептата, зададени от това устройство, по реда на задаване. */
export function useRememberedQuestions(recipeId: string) {
  const { list, update } = useRememberedList(
    recipeId,
    'questions',
    LISTS.questions,
  );
  return { questions: list, update };
}

/** Приложените промени за готвенето на рецептата на това устройство, по реда на прилагане. */
export function useAppliedChanges(recipeId: string) {
  const { list, update } = useRememberedList(
    recipeId,
    'applied',
    LISTS.applied,
  );
  return { applied: list, update };
}

const ingredientsOpen = storedSetting<boolean>({
  key: COOKING_INGREDIENTS_OPEN_KEY,
  parse: (raw) => raw !== 'closed',
  unset: true,
  format: () => 'closed',
});

/**
 * Дали чекмеджето с продуктите е отворено: помни се на устройството, по подразбиране отворено. Състоянието е на
 * екрана, а записът само го пази за следващото влизане, за да се прибира и без localStorage.
 */
export function useIngredientsOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(ingredientsOpen.read);
  return [
    open,
    (next: boolean) => {
      setOpen(next);
      ingredientsOpen.write(next);
    },
  ];
}

/** Мащабите на текста на стъпката спрямо едрия по подразбиране (1); A−/A+ местят с една степен. */
export const COOKING_TEXT_SIZES = [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3] as const;

const textSize = storedSetting<number>({
  key: COOKING_TEXT_SIZE_KEY,
  parse: (raw) => {
    const value = Number(raw);
    return (COOKING_TEXT_SIZES as readonly number[]).includes(value)
      ? value
      : 1;
  },
  unset: 1,
});

/**
 * Мащабът на текста на стъпката: помни се на устройството (телефонът иска по-дребен от kiosk-а), по подразбиране 1.
 * Както при чекмеджето, състоянието е на екрана, а записът го пази за следващото влизане.
 */
export function useCookingTextSize(): [number, (size: number) => void] {
  const [size, setSize] = useState(textSize.read);
  return [
    size,
    (next: number) => {
      setSize(next);
      textSize.write(next);
    },
  ];
}

const readSteps = storedSetting<boolean>({
  key: COOKING_READ_STEPS_KEY,
  parse: (raw) => raw === 'on',
  unset: false,
  format: () => 'on',
});

/**
 * „Чети стъпките“ (GLOSSARY: Четене на глас): всяка нова стъпка се чете сама. Помни се на устройството, по
 * подразбиране е изключено, а без localStorage работи изключено при всяко влизане. Както при размера на текста,
 * състоянието е на екрана, а записът го пази за следващото влизане.
 */
export function useReadSteps(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readSteps.read);
  return [
    on,
    (next: boolean) => {
      setOn(next);
      readSteps.write(next);
    },
  ];
}
