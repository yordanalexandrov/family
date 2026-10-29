import { recipeFiltersSchema } from '@family/shared';
import { useCallback, useState } from 'react';
import { logger } from '../../logger';
import { NO_FILTERS, type RecipeFilters } from './RecipeFiltersSheet';

const KEY = 'family.recipeFilters';

/** Записаните филтри през `recipeFiltersSchema`; непознатите стойности (стар запис, ръчна намеса) отпадат. */
function parse(raw: string | null): RecipeFilters {
  if (raw === null) {
    return NO_FILTERS;
  }
  try {
    return recipeFiltersSchema.safeParse(JSON.parse(raw)).data ?? NO_FILTERS;
  } catch {
    return NO_FILTERS;
  }
}

function read(): RecipeFilters {
  try {
    return parse(sessionStorage.getItem(KEY));
  } catch (error) {
    logger.warn('sessionStorage недостъпен', error);
    return NO_FILTERS;
  }
}

/**
 * Филтрите на регистъра за сесията на таба (sessionStorage): остават след отваряне на рецепта и връщане,
 * но не и след затваряне на приложението.
 */
export function useStoredRecipeFilters() {
  const [filters, setFilters] = useState(read);
  const set = useCallback((next: RecipeFilters) => {
    setFilters(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch (error) {
      logger.warn('sessionStorage недостъпен', error);
    }
  }, []);
  return [filters, set] as const;
}
