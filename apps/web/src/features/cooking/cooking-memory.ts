import { type DateKey, dateKeyInSofia, type Recipe } from '@family/shared';
import { useState } from 'react';
import { storedSetting } from '../../app/stored-setting';
import { logger } from '../../logger';

export const COOKING_PROGRESS_KEY = 'family.cooking.progress';
export const COOKING_INGREDIENTS_OPEN_KEY = 'family.cooking.ingredientsOpen';
export const COOKING_TEXT_SIZE_KEY = 'family.cooking.textSize';

/** Докъдето е стигнало Готвене за една рецепта: индексът на стъпката и на отметнатите редове продукти. */
export interface CookingProgress {
  step: number;
  used: readonly number[];
}

/** Записът на устройството: напредъкът по рецепта за един ден; запис от друг ден не важи. */
interface StoredProgress {
  day: DateKey;
  recipes: Record<string, CookingProgress>;
}

const START: CookingProgress = { step: 0, used: [] };

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

/** Запазеният днес напредък за `recipe`, ако още пасва на стъпките и продуктите ѝ. */
function readProgress(recipe: Recipe): CookingProgress {
  const saved: unknown = readStored().recipes[recipe.id];
  if (typeof saved !== 'object' || saved === null) {
    return START;
  }
  const { step, used } = saved as Partial<CookingProgress>;
  const isIndex = (value: unknown, length: number): value is number =>
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < length;
  return {
    step: isIndex(step, recipe.steps.length) ? step : 0,
    used: Array.isArray(used)
      ? [
          ...new Set(
            used.filter((index) => isIndex(index, recipe.ingredients.length)),
          ),
        ]
      : [],
  };
}

/** Записва напредъка по рецептата за днес; без `progress` го трие. */
function writeProgress(recipeId: string, progress?: CookingProgress): void {
  // Записът е само за днес: преминаването в нов ден изхвърля напредъка по всички рецепти.
  const stored = readStored();
  if (progress) {
    stored.recipes[recipeId] = progress;
  } else {
    delete stored.recipes[recipeId];
  }
  try {
    localStorage.setItem(COOKING_PROGRESS_KEY, JSON.stringify(stored));
  } catch (error) {
    logger.warn('Напредъкът в Готвене не се записа', error);
  }
}

/**
 * Стъпката и отметките на Готвене за `recipe`, запомнени на устройството до края на деня (по софийско време).
 * `finish` („Готово“) ги забравя, така че ново влизане същия ден започва отначало. Нищо не стига до сървъра; без
 * localStorage Готвене работи без памет.
 */
export function useCookingProgress(recipe: Recipe) {
  const [progress, setProgress] = useState(() => readProgress(recipe));
  const update = (next: CookingProgress) => {
    setProgress(next);
    writeProgress(recipe.id, next);
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
    finish: () => writeProgress(recipe.id),
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
