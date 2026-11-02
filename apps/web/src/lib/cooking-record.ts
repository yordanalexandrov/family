import {
  type DateKey,
  dateKeyInSofia,
  lastCookingAppliedSchema,
} from '@family/shared';
import { logger } from '../logger';

export const COOKING_PROGRESS_KEY = 'family.cooking.progress';

/**
 * Записът на Готвене на устройството: по рецепта за един ден; запис от друг ден не важи. Какво има в записа на една
 * рецепта знае `features/cooking/cooking-memory.ts`; тук е само четенето и писането, и последното готвене, което
 * „Как мина?“ чете и извън Готвене.
 */
interface StoredRecords {
  day: DateKey;
  recipes: Record<string, unknown>;
}

function today(): DateKey {
  return dateKeyInSofia(new Date());
}

/** Днешният запис; липсващ, стар, повреден или недостъпен localStorage — празен. */
function readStored(): StoredRecords {
  const empty = { day: today(), recipes: {} };
  try {
    const raw = localStorage.getItem(COOKING_PROGRESS_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<StoredRecords>) : null;
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

/** Днешният запис на рецептата с `recipeId`; липсващ — празен. Полетата му са непроверени. */
export function readCookingRecord<Record extends object>(
  recipeId: string,
): Partial<Record> {
  return readFrom<Record>(readStored(), recipeId);
}

/**
 * Сменя днешния запис на рецептата с `recipeId`: `change` получава сегашния (или празен) и връща новия; без
 * `change` записът се трие. Преминаването в нов ден изхвърля записите на всички рецепти.
 */
export function updateCookingRecord<Record extends object>(
  recipeId: string,
  change?: (current: Partial<Record>) => Partial<Record>,
): void {
  const stored = readStored();
  if (change) {
    stored.recipes[recipeId] = change(readFrom<Record>(stored, recipeId));
  } else {
    delete stored.recipes[recipeId];
  }
  try {
    localStorage.setItem(COOKING_PROGRESS_KEY, JSON.stringify(stored));
  } catch (error) {
    logger.warn('Напредъкът в Готвене не се записа', error);
  }
}

function readFrom<Record extends object>(
  stored: StoredRecords,
  recipeId: string,
): Partial<Record> {
  const current: unknown = stored.recipes[recipeId];
  return typeof current === 'object' && current !== null ? current : {};
}

/**
 * `applied` на поправка от „Как мина?“: приложените промени от последното готвене на рецептата на това устройство днес
 * (id-тата на въпросите им, които „Готово“ пази в `lastApplied`); от вчера, повредени или без такова — няма.
 */
export function lastCookingApplied(recipeId: string): readonly string[] {
  const parsed = lastCookingAppliedSchema.safeParse(
    readCookingRecord<{ lastApplied: unknown }>(recipeId).lastApplied,
  );
  return parsed.success ? parsed.data : [];
}
