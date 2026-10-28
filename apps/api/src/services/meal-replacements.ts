import {
  MEAL_REPLACE_MIN_RECIPES,
  type MealReplaceInput,
  type MealReplaceOutput,
  type MealReplaceRequest,
  type MenuProposeRecipe,
  mealTitle,
} from '@family/shared';
import type { DbExecutor } from '../db/client.js';
import {
  findReplacement,
  hasPendingReplacement,
  insertReplacement,
  lockMeal,
  setReplacementCandidates,
} from '../db/repositories/meal-replacements.js';
import {
  findMeal,
  findPlanByWeek,
  findPlanSummary,
  listComments,
} from '../db/repositories/menu.js';
import { listUseUp } from '../db/repositories/pantry.js';
import { listMenuRecipes } from '../db/repositories/recipes.js';
import { listUsers } from '../db/repositories/users.js';
import { mealReplaceRequest } from '../db/schema/menu.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { ConflictError, NotFoundError, refuse } from './errors.js';
import { NO_SUCH_MEAL, refusePastMeal } from './menu.js';

const MEAL_HAS_PENDING = 'За ястието вече се търси друго';

/**
 * The registry recipes of the meal's slot other than its own: what `meal.replace` may pick from, each last served
 * before the meal's date.
 */
async function otherRecipes(
  db: DbExecutor,
  meal: {
    date: string;
    slot: MealReplaceInput['slot'];
    recipeId: string | null;
  },
): Promise<MenuProposeRecipe[]> {
  const recipes = await listMenuRecipes(db, meal.slot, meal.date);
  return recipes.filter((recipe) => recipe.id !== meal.recipeId);
}

/**
 * „✨ Предложи друго“: `meal.replace` as AI requests, registered in `buildApp()` as `app.mealReplacements`; the params
 * are the meal's id. One request per meal at a time; picking a candidate is `PATCH` of the meal.
 */
export type MealReplacements = ContractRequestHandle<
  string,
  MealReplaceRequest
>;

/**
 * How `meal.replace` requests are stored: refused for an unknown or past meal, with fewer than 3 other recipes of its
 * slot, or while one is pending for the meal. The input is the meal, its thread, the other meals of its week, the
 * registry without its recipe (with ratings and last servings) and the use-up products; a valid answer is kept as the
 * candidates.
 */
export function createMealReplaceStore(
  now: () => Date,
): ContractRequestStore<
  string,
  MealReplaceRequest,
  MealReplaceInput,
  MealReplaceOutput
> {
  return {
    table: mealReplaceRequest,

    async insert(tx, mealId, requestedBy) {
      await lockMeal(tx, mealId);
      const meal = await findMeal(tx, mealId);
      if (!meal) {
        throw new NotFoundError(NO_SUCH_MEAL);
      }
      refusePastMeal(meal, now());
      const have = (await otherRecipes(tx, meal)).length;
      if (have < MEAL_REPLACE_MIN_RECIPES) {
        throw refuse(
          'not_enough_recipes',
          `За друго ястие трябват поне ${MEAL_REPLACE_MIN_RECIPES} други рецепти`,
          { have, need: MEAL_REPLACE_MIN_RECIPES },
        );
      }
      if (await hasPendingReplacement(tx, mealId)) {
        throw new ConflictError(MEAL_HAS_PENDING);
      }
      return insertReplacement(tx, mealId, requestedBy);
    },

    find: findReplacement,

    async buildInput(db, request) {
      const meal = await findMeal(db, request.mealId);
      const summary = meal && (await findPlanSummary(db, meal.planId));
      const plan = summary && (await findPlanByWeek(db, summary.weekStart));
      if (!meal || !plan) {
        throw new Error('meal of a replacement request vanished');
      }
      const names = new Map(
        (await listUsers(db)).map((user) => [user.id, user.name]),
      );
      return {
        date: meal.date,
        slot: meal.slot,
        current: {
          ...(meal.recipeId === null ? {} : { recipeId: meal.recipeId }),
          ...(meal.recipe ? { title: meal.recipe.title } : {}),
          ...(meal.note === null ? {} : { note: meal.note }),
        },
        thread: (await listComments(db, meal.id)).map((line) => ({
          author: names.get(line.authorUserId) ?? '',
          body: line.body,
          kind: line.kind,
        })),
        week: plan.meals.flatMap((other) => {
          const title = mealTitle(other);
          return other.id !== meal.id && title
            ? [{ date: other.date, title }]
            : [];
        }),
        recipes: await otherRecipes(db, meal),
        useUp: await listUseUp(db),
      };
    },

    async onDone(tx, request, output) {
      await setReplacementCandidates(tx, request.id, output.candidates);
    },
  };
}
