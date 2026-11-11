import {
  addDays,
  type Meal,
  type MealPlan,
  type UpdateMeal,
} from '@family/shared';
import { useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { useRecipes } from '../recipes/queries';
import { useDebouncedValue } from '../recipes/useDebouncedValue';
import { usePlan } from './queries';

const SEARCH_DEBOUNCE_MS = 300;

interface RecipePickerProps {
  meal: Meal;
  plan: MealPlan;
  onPick: (change: UpdateMeal) => void;
}

/**
 * „Избери от рецептите“ в листа на ястието: търсене сред вечерните рецепти с маркери „в тази седмица“ и „последните 2
 * седмици“. Сегашната рецепта е натисната и не се избира пак.
 */
export function RecipePicker({ meal, plan, onPick }: RecipePickerProps) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();
  const recipes = useRecipes({ tags: ['dinner'], ...(q ? { q } : {}) });
  const recent = useRecentRecipeIds(plan.weekStart);
  const inWeek = new Set(
    plan.meals
      .filter((m) => m.id !== meal.id && m.recipeId !== null)
      .map((m) => m.recipeId),
  );

  return (
    <div className="meal-tools__picker">
      <input
        type="search"
        className="field__input"
        aria-label="Търси рецепта"
        placeholder="Търси по заглавие"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {recipes.isPending ? (
        <Spinner />
      ) : recipes.isError ? (
        <ErrorBox
          error={recipes.error}
          onRetry={() => void recipes.refetch()}
        />
      ) : (
        <ul className="recipe-picker" aria-label="Вечерни рецепти">
          {recipes.data.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                className="recipe-picker__option"
                aria-pressed={recipe.id === meal.recipeId}
                onClick={() =>
                  recipe.id !== meal.recipeId && onPick({ recipeId: recipe.id })
                }
              >
                <span>{recipe.title}</span>
                {inWeek.has(recipe.id) && (
                  <span className="badge">в тази седмица</span>
                )}
                {recent.has(recipe.id) && (
                  <span className="badge">последните 2 седмици</span>
                )}
              </button>
            </li>
          ))}
          {recipes.data.length === 0 && (
            <li className="recipe-picker__empty">Няма такава рецепта.</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Рецептите от менютата на двете предходни седмици. */
function useRecentRecipeIds(weekStart: string): Set<string> {
  const week1 = usePlan(addDays(weekStart, -7));
  const week2 = usePlan(addDays(weekStart, -14));
  const ids = new Set<string>();
  for (const plan of [week1.data, week2.data]) {
    for (const meal of plan?.meals ?? []) {
      if (meal.recipeId !== null) {
        ids.add(meal.recipeId);
      }
    }
  }
  return ids;
}
