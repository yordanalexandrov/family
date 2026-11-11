import {
  type CreateMenuRework,
  classifyRework,
  dateKeyInSofia,
  MENU_SLOTS,
  type Meal,
  type MealPlan,
  type MenuReworkDay,
  type MenuReworkInput,
  type MenuReworkOutput,
  type MenuReworkRequest,
  type ReworkDay,
} from '@family/shared';
import type { DbExecutor } from '../db/client.js';
import {
  deleteReplacementsOf,
  hasPendingReplacementInPlan,
} from '../db/repositories/meal-replacements.js';
import {
  findPlanByWeek,
  lockWeek,
  setPlanSummary,
} from '../db/repositories/menu.js';
import {
  findLatestRework,
  findRework,
  insertRework,
  setReworkChanged,
} from '../db/repositories/menu-reworks.js';
import { listUseUp } from '../db/repositories/pantry.js';
import { listMenuRecipes } from '../db/repositories/recipes.js';
import { menuReworkRequest } from '../db/schema/menu.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { refuse } from './errors.js';
import { type EventBus, menuAndShoppingChanged } from './events.js';
import type { InboxService } from './inbox.js';
import { agentThread, changeRecipe, refuseReworkingWeek } from './menu.js';
import type { MenuNotifications } from './menu-notifications.js';

/** Phase 1 plans dinner only (`MENU_SLOTS`). */
const [DINNER] = MENU_SLOTS;

const NO_SUCH_PLAN = 'Няма меню за тази седмица';
const REPLACEMENT_PENDING =
  'За ястие от седмицата се търси друго: изчакай да свърши';
const NOTHING_TO_REWORK =
  'Няма какво да се смени или попълни: менюто от днес нататък е договорено';
const NO_REWORK = 'Никой не е преработвал менюто на тази седмица';

/**
 * „✨ Преработи менюто“: `menu.rework` as AI requests (GLOSSARY: Преработка на менюто), registered in `buildApp()` as
 * `app.menuReworks`.
 */
export type MenuReworks = ContractRequestHandle<
  CreateMenuRework,
  MenuReworkRequest
>;

/** The newest rework of the week, whoever asked and whatever its status; 404 `no_rework` without one. */
export async function getLatestRework(
  db: DbExecutor,
  weekStart: string,
): Promise<MenuReworkRequest> {
  const latest = await findLatestRework(db, weekStart);
  if (!latest) {
    throw refuse('no_rework', NO_REWORK);
  }
  return latest;
}

/** The days of the plan as the rework sees them today (Sofia). */
function classify(plan: MealPlan, at: Date): ReworkDay<Meal>[] {
  return classifyRework(plan.meals, dateKeyInSofia(at));
}

/**
 * The dinner registry the agent may choose from: without the recipes of kept days (they stay in the week) and of
 * vetoed ones (barred from the week). Each recipe is last served before the week.
 */
async function freeRecipes(
  db: DbExecutor,
  weekStart: string,
  days: ReworkDay<Meal>[],
) {
  const barred = new Set(
    days.flatMap(({ meal, status, reason }) =>
      meal.recipeId !== null && (status === 'keep' || reason === 'vetoed')
        ? [meal.recipeId]
        : [],
    ),
  );
  const recipes = await listMenuRecipes(db, DINNER, weekStart);
  return recipes.filter((recipe) => !barred.has(recipe.id));
}

/** What a past or a kept day shows the agent: its recipe and its note, each only if it has one. */
function fixedDay(meal: Meal) {
  return {
    date: meal.date,
    slot: meal.slot,
    ...(meal.recipeId === null ? {} : { recipeId: meal.recipeId }),
    ...(meal.recipe ? { title: meal.recipe.title } : {}),
    ...(meal.note === null ? {} : { note: meal.note }),
  };
}

/**
 * How `menu.rework` requests are stored. Refused, in a transaction that holds the week: 404 `no_plan` for a week
 * without a menu, 409 `menu_reworking` while a rework of it is pending, 409 `replacement_pending` while „Предложи
 * друго“ is pending for one of its meals, 409 `nothing_to_rework` without a day to replace or fill from today on, 409
 * `not_enough_recipes` with fewer free dinner recipes than days to fill. The input is built when the run starts, by
 * `classifyRework` on the day the rework was asked for; a valid answer is written into the plan (see `onDone`). Every
 * change of the rework's status signals `menu.rework.changed`; a written answer also `menu.changed` and
 * `shopping.changed`, and „Преработено меню“ goes to the others when a dish changed; the changed days go to
 * `inbox.answered` („Извадих“ no longer holds for them).
 */
export function createMenuReworkStore(
  events: EventBus,
  notifications: Pick<MenuNotifications, 'reworked'>,
  now: () => Date,
  inbox: Pick<InboxService, 'answered'>,
): ContractRequestStore<
  CreateMenuRework,
  MenuReworkRequest,
  MenuReworkInput,
  MenuReworkOutput
> {
  const signalRework = (rework: MenuReworkRequest) =>
    events.publish({
      type: 'menu.rework.changed',
      weekStart: rework.weekStart,
    });
  /** The meals each rework's `onDone` changed, for its `afterDone` to tell `inbox` once they have committed. */
  const changedMeals = new Map<string, string[]>();

  return {
    table: menuReworkRequest,

    async insert(tx, params, requestedBy) {
      await lockWeek(tx, params.weekStart);
      const plan = await findPlanByWeek(tx, params.weekStart);
      if (!plan) {
        throw refuse('no_plan', NO_SUCH_PLAN);
      }
      await refuseReworkingWeek(tx, plan.id);
      if (await hasPendingReplacementInPlan(tx, plan.id)) {
        throw refuse('replacement_pending', REPLACEMENT_PENDING);
      }
      const at = now();
      const days = classify(plan, at);
      const need = days.filter((day) => day.status === 'fill').length;
      if (need === 0) {
        throw refuse('nothing_to_rework', NOTHING_TO_REWORK);
      }
      const have = (await freeRecipes(tx, params.weekStart, days)).length;
      if (have < need) {
        throw refuse(
          'not_enough_recipes',
          `За преработката трябват поне ${need} свободни вечерни рецепти`,
          { have, need },
        );
      }
      return insertRework(tx, {
        planId: plan.id,
        weekStart: params.weekStart,
        hint: params.hint,
        requestedBy,
        createdAt: at,
      });
    },

    find: findRework,

    async buildInput(db, rework) {
      const plan = await findPlanByWeek(db, rework.weekStart);
      if (!plan) {
        throw new Error('plan of a rework vanished');
      }
      // As the request saw them, even when the run starts after midnight: the input is what was asked for.
      const days = classify(plan, new Date(rework.createdAt));
      const inputDays: MenuReworkDay[] = [];
      for (const { meal, status, reason } of days) {
        if (status !== 'fill' || reason === undefined) {
          inputDays.push({
            ...fixedDay(meal),
            status: status === 'past' ? 'past' : 'keep',
          });
          continue;
        }
        inputDays.push({
          ...fixedDay(meal),
          status: 'fill',
          reason,
          thread: await agentThread(db, meal.id),
        });
      }
      return {
        weekStart: rework.weekStart,
        slots: [...MENU_SLOTS],
        days: inputDays,
        recipes: await freeRecipes(db, rework.weekStart, days),
        useUp: await listUseUp(db),
        ...(rework.hint === undefined ? {} : { hint: rework.hint }),
      };
    },

    /**
     * Each answered day gets its recipe and why, unless it is the recipe it had: its votes go (the AI does not vote),
     * a line of the AI goes into its thread on behalf of who asked, it leaves the shopping list, its „Предложи друго“
     * requests and its kept change go, and „Извадих“ no longer holds. The note, the cook and the servings stay. The
     * plan gets the new summary. Not recorded as menu activity: the digest is about what people did.
     */
    async onDone(tx, rework, output) {
      const plan = await findPlanByWeek(tx, rework.weekStart);
      if (!plan) {
        throw new Error('plan of a rework vanished');
      }
      const at = now();
      let changed = 0;
      const mealIds: string[] = [];
      for (const day of output.days) {
        const meal = plan.meals.find(
          (m) => m.date === day.date && m.slot === day.slot,
        );
        if (!meal) {
          throw new Error(`no meal of the plan on ${day.date} ${day.slot}`);
        }
        if (meal.recipeId === day.recipeId) {
          continue;
        }
        await changeRecipe(
          tx,
          meal,
          { recipeId: day.recipeId, why: day.why },
          { by: 'rework', actingUserId: rework.requestedBy },
          at,
        );
        await deleteReplacementsOf(tx, meal.id);
        changed += 1;
        mealIds.push(meal.id);
      }
      changedMeals.set(rework.id, mealIds);
      await setPlanSummary(tx, plan.id, output.summary, at);
      await setReworkChanged(tx, rework.id, changed);
    },

    afterRequest: signalRework,

    afterFailed(rework) {
      // `onDone` ran, but the transaction that marks the rework done did not commit.
      changedMeals.delete(rework.id);
      signalRework(rework);
    },

    async afterDone(rework) {
      signalRework(rework);
      for (const event of menuAndShoppingChanged(rework.weekStart)) {
        events.publish(event);
      }
      void notifications.reworked(rework);
      const mealIds = changedMeals.get(rework.id) ?? [];
      changedMeals.delete(rework.id);
      await inbox.answered(mealIds);
    },
  };
}
