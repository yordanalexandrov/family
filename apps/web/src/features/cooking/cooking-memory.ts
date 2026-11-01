import {
  applyCookingChanges,
  type CookingChange,
  cookingChangeSchema,
  type DateKey,
  dateKeyInSofia,
  type Recipe,
  recipeCookingLines,
} from '@family/shared';
import { useRef, useState } from 'react';
import { storedSetting } from '../../app/stored-setting';
import { logger } from '../../logger';

export const COOKING_PROGRESS_KEY = 'family.cooking.progress';
export const COOKING_INGREDIENTS_OPEN_KEY = 'family.cooking.ingredientsOpen';
export const COOKING_TEXT_SIZE_KEY = 'family.cooking.textSize';

/**
 * Докъдето е стигнало Готвене за една рецепта: индексът на стъпката, на отметнатите редове продукти и кои елементи от
 * подготовката са направени (по един на елемент, в реда на рецептата).
 */
export interface CookingProgress {
  step: number;
  used: readonly number[];
  prepared: readonly boolean[];
}

/**
 * Въпрос в Готвене, зададен от това устройство: id-то му в api и текстът, за да личи и да се пита пак, ако api вече
 * не го знае (404).
 */
export interface RememberedQuestion {
  id: string;
  question: string;
}

/**
 * Приложена промяна за готвенето (GLOSSARY: Промяна за готвенето): id-то на въпроса, чийто отговор я носи, порциите
 * при въпроса (за тях са количествата ѝ) и самата промяна, за да важи на екрана и без api.
 */
export interface AppliedChange {
  id: string;
  servings: number;
  change: CookingChange;
}

/**
 * Записът на една рецепта на устройството: напредъкът (отметките на подготовката важат само за подготовката
 * `preparedFor`), въпросите в Готвене по реда на задаване и приложените промени за готвенето по реда на прилагане.
 * Полетата се пишат поотделно и всяко може да липсва.
 */
interface StoredRecipeProgress extends CookingProgress {
  preparedFor: string;
  questions: readonly RememberedQuestion[];
  applied: readonly AppliedChange[];
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

/** Запазеният днес напредък за `recipe`, ако още пасва на стъпките, продуктите (с приложените промени) и подготовката ѝ. */
function readProgress(recipe: Recipe): CookingProgress {
  const saved: unknown = readStored().recipes[recipe.id];
  if (typeof saved !== 'object' || saved === null) {
    return start(recipe);
  }
  const lines = applyCookingChanges(
    recipeCookingLines(recipe),
    readApplied(recipe.id),
  ).length;
  const { step, used, prepared, preparedFor } =
    saved as Partial<StoredRecipeProgress>;
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
 * `finish` („Готово“) ги забравя, така че ново влизане същия ден започва отначало. Нищо не стига до сървъра; без
 * localStorage Готвене работи без памет.
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
    finish: () => writeProgress(recipe),
  };
}

function isRemembered(value: unknown): value is RememberedQuestion {
  const { id, question } = (value ?? {}) as Partial<RememberedQuestion>;
  return (
    typeof id === 'string' &&
    id !== '' &&
    typeof question === 'string' &&
    question !== ''
  );
}

/** Днешните въпроси по рецептата; липсващо или повредено поле — няма въпроси. */
function readQuestions(recipeId: string): readonly RememberedQuestion[] {
  const { questions } = readRecipe(recipeId);
  if (!Array.isArray(questions) || !questions.every(isRemembered)) {
    return [];
  }
  return questions.map(({ id, question }) => ({ id, question }));
}

/**
 * Въпросите в Готвене по рецептата, зададени от това устройство, по реда на задаване: помнят се в записа на
 * напредъка (`useCookingProgress`), до края на деня или до „Готово“. `update` смята новия списък от последния, дори
 * между две изобразявания.
 */
export function useRememberedQuestions(recipeId: string) {
  const [questions, setQuestions] = useState(() => readQuestions(recipeId));
  const latest = useRef(questions);
  return {
    questions,
    update(
      change: (
        current: readonly RememberedQuestion[],
      ) => readonly RememberedQuestion[],
    ) {
      latest.current = change(latest.current);
      setQuestions(latest.current);
      const next = latest.current;
      updateRecipe(recipeId, (current) => ({ ...current, questions: next }));
    },
  };
}

function isApplied(value: unknown): value is AppliedChange {
  const { id, servings, change } = (value ?? {}) as Partial<AppliedChange>;
  return (
    typeof id === 'string' &&
    id !== '' &&
    Number.isInteger(servings) &&
    (servings as number) >= 1 &&
    cookingChangeSchema.safeParse(change).success
  );
}

/** Днешните приложени промени по рецептата; липсващо или повредено поле — няма приложени. */
function readApplied(recipeId: string): readonly AppliedChange[] {
  const { applied } = readRecipe(recipeId);
  if (!Array.isArray(applied) || !applied.every(isApplied)) {
    return [];
  }
  // Промяната, както я чете schema-та: запомнена преди стъпките, тя няма стъпки.
  return applied.map(({ id, servings, change }) => ({
    id,
    servings,
    change: cookingChangeSchema.parse(change),
  }));
}

/**
 * Приложените промени за готвенето на рецептата на това устройство, по реда на прилагане: помнят се с въпросите, до
 * края на деня или до „Готово“. `update` смята новия списък от последния.
 */
export function useAppliedChanges(recipeId: string) {
  const [applied, setApplied] = useState(() => readApplied(recipeId));
  const latest = useRef(applied);
  return {
    applied,
    update(
      change: (current: readonly AppliedChange[]) => readonly AppliedChange[],
    ) {
      latest.current = change(latest.current);
      setApplied(latest.current);
      const next = latest.current;
      updateRecipe(recipeId, (current) => ({ ...current, applied: next }));
    },
  };
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
