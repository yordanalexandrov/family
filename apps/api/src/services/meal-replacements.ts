import {
  addDays,
  dateKeyInSofia,
  isPastMeal,
  MEAL_REPLACE_MIN_RECIPES,
  type MealReplaceInput,
  type MealReplaceOutput,
  type MealReplaceRequest,
  mealTitle,
} from '@family/shared';
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
  listRecipeIdsOfWeeks,
} from '../db/repositories/menu.js';
import { listMenuRecipes } from '../db/repositories/recipes.js';
import { listUsers } from '../db/repositories/users.js';
import { mealReplaceRequest } from '../db/schema/menu.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { ConflictError, NotFoundError } from './errors.js';

const NO_SUCH_MEAL = 'Няма такова ястие';
const NO_SUCH_REPLACEMENT = 'Няма такова търсене на друго ястие';
const PAST_MEAL = 'Денят е минал: ястието вече не се сменя';
const MEAL_HAS_PENDING = 'За ястието вече се търси друго';

/** `meal.replace` as AI requests, registered in `buildApp()`; the params are the meal's id. */
export type MealReplacements = ContractRequestHandle<
  string,
  MealReplaceRequest
>;

/** „✨ Предложи друго“: one `meal.replace` request per meal at a time; picking a candidate is `PATCH` of the meal. */
export interface MealReplacementsService {
  /** Stores a `pending` request for the meal and starts `meal.replace` in the background; returned at once. */
  request(mealId: string, actingUserId: string): Promise<MealReplaceRequest>;
  get(id: string): Promise<MealReplaceRequest>;
}

export function createMealReplacementsService(
  requests: MealReplacements,
): MealReplacementsService {
  return {
    request: (mealId, actingUserId) => requests.request(mealId, actingUserId),
    async get(id) {
      const replacement = await requests.get(id);
      if (!replacement) {
        throw new NotFoundError(NO_SUCH_REPLACEMENT);
      }
      return replacement;
    },
  };
}

/**
 * How `meal.replace` requests are stored: refused for an unknown or past meal, with fewer than 3 other recipes of its
 * slot, or while one is pending for the meal. The input is the meal, its thread, the other meals of its week, the
 * registry without its recipe and the recipes of the 2 previous weeks; a valid answer is kept as the candidates.
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
      if (isPastMeal(meal, dateKeyInSofia(now()))) {
        throw new ConflictError(PAST_MEAL, { code: 'past_meal' });
      }
      const have = (await listMenuRecipes(tx, meal.slot)).filter(
        (recipe) => recipe.id !== meal.recipeId,
      ).length;
      if (have < MEAL_REPLACE_MIN_RECIPES) {
        throw new ConflictError(
          `За друго ястие трябват поне ${MEAL_REPLACE_MIN_RECIPES} други рецепти`,
          {
            code: 'not_enough_recipes',
            have,
            need: MEAL_REPLACE_MIN_RECIPES,
          },
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
        recipes: (await listMenuRecipes(db, meal.slot)).filter(
          (recipe) => recipe.id !== meal.recipeId,
        ),
        recentRecipeIds: await listRecipeIdsOfWeeks(db, [
          addDays(plan.weekStart, -14),
          addDays(plan.weekStart, -7),
        ]),
      };
    },

    async onDone(tx, request, output) {
      await setReplacementCandidates(tx, request.id, output.candidates);
    },
  };
}
