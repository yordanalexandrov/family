import {
  addDays,
  type CookingMeal,
  type CreateMenuProposal,
  daysOfWeek,
  hasWeekStarted,
  MENU_PROPOSE_MIN_RECIPES,
  MENU_SLOTS,
  type Meal,
  type MealPlan,
  type MealPlanSummary,
  type MenuProposalRequest,
  type MenuProposeInput,
  type MenuSlot,
  mealTitle,
  menuPropose,
  oneServingEach,
  type Servings,
  type UpdateMeal,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db, DbExecutor } from '../db/client.js';
import {
  deletePlan,
  failPendingProposalsBefore,
  findMeal,
  findMealOn,
  findPlanByWeek,
  findPlanSummary,
  findProposal,
  finishProposal,
  hasPendingProposal,
  insertPlan,
  insertProposal,
  listPlans,
  listRecipeIdsOfWeeks,
  lockWeek,
  type NewMeal,
  updateMeal,
} from '../db/repositories/menu.js';
import {
  countMenuRecipes,
  isMenuRecipe,
  listMenuRecipes,
} from '../db/repositories/recipes.js';
import { listUsers } from '../db/repositories/users.js';
import {
  createContractRuns,
  type OpenClawAgent,
  staleCutoff,
} from './contract-runs.js';
import {
  ConflictError,
  InvalidReferenceError,
  NotFoundError,
  OpenClawUnavailableError,
} from './errors.js';

/** The slot phase 1 plans, and the one „Днес се готви“ shows; typed so it cannot leave `MENU_SLOTS` unnoticed. */
const DINNER: MenuSlot = 'dinner';

const NO_SUCH_PLAN = 'Няма меню за тази седмица';
const NO_SUCH_MEAL = 'Няма такова ястие';
const NO_SUCH_PROPOSAL = 'Няма такова предложение за меню';
const WEEK_HAS_PLAN = 'Седмицата вече има меню';
const WEEK_HAS_PENDING = 'За седмицата вече се подготвя предложение';

export interface MenuService {
  /** The plan of the week with its meals. */
  getPlan(weekStart: string): Promise<MealPlan>;
  listPlans(from: string, to: string): Promise<MealPlanSummary[]>;
  /** A plan of empty meals: no recipe, no cook, one serving for each user. */
  createEmptyPlan(weekStart: string, actingUserId: string): Promise<MealPlan>;
  /** Only until the week has begun (Monday 00:00 in Sofia); after that the plan is edited live. */
  deletePlan(id: string): Promise<void>;
  /** A changed recipe must be in the registry, not archived, tagged `dinner`, and clears the agent's `why`. */
  updateMeal(id: string, patch: UpdateMeal): Promise<Meal>;
  /** Stores a `pending` proposal and starts `menu.propose` in the background; the proposal is returned at once. */
  requestProposal(
    params: CreateMenuProposal,
    actingUserId: string,
  ): Promise<MenuProposalRequest>;
  getProposal(id: string): Promise<MenuProposalRequest>;
  /** At start: `pending` proposals older than 10 minutes were cut off by a restart and become `failed`/`stale`. */
  failStaleProposals(): Promise<number>;
  /** Aborts the runs still going (they end `failed`/`aborted`) and waits for them, before the pool closes. */
  close(): Promise<void>;
}

/**
 * The weekly menu (GLOSSARY: Седмично меню, Ястие, Предложение за меню). Runs `menu.propose` in the api process, so it
 * keeps the runs in flight; created once in `buildApp()` as `app.menu`. `openclaw: null` = proposals are refused.
 */
export function createMenuService({
  db,
  openclaw,
  log,
  now,
}: {
  db: Db;
  /** The agent that answers `menu.propose` (`OPENCLAW_MENU_AGENT`). */
  openclaw: OpenClawAgent | null;
  log: FastifyBaseLogger;
  now: () => Date;
}): MenuService {
  const runs = createContractRuns(log);

  /** Run it in a transaction: holds the week's lock until the plan or the proposal is inserted. */
  async function refuseTakenWeek(
    tx: DbExecutor,
    weekStart: string,
  ): Promise<void> {
    await lockWeek(tx, weekStart);
    if (await findPlanByWeek(tx, weekStart)) {
      throw new ConflictError(WEEK_HAS_PLAN);
    }
    if (await hasPendingProposal(tx, weekStart)) {
      throw new ConflictError(WEEK_HAS_PENDING);
    }
  }

  async function runProposal(
    { client, agent }: OpenClawAgent,
    proposal: MenuProposalRequest,
    signal: AbortSignal,
  ): Promise<void> {
    const input: MenuProposeInput = {
      weekStart: proposal.weekStart,
      slots: [...MENU_SLOTS],
      recipes: await listMenuRecipes(db, DINNER),
      recentRecipeIds: await listRecipeIdsOfWeeks(db, [
        addDays(proposal.weekStart, -14),
        addDays(proposal.weekStart, -7),
      ]),
      hint: proposal.hint,
    };
    const output = await client.complete(menuPropose, input, {
      agent,
      signal,
    });
    const servings = await defaultServings(db);
    await db.transaction(async (tx) => {
      const plan = await insertPlan(
        tx,
        {
          weekStart: proposal.weekStart,
          summary: output.summary,
          createdBy: proposal.requestedBy,
        },
        output.days.map((day) => ({
          date: day.date,
          slot: day.slot,
          recipeId: day.recipeId,
          why: day.why,
          servings,
        })),
      );
      await finishProposal(tx, proposal.id, {
        status: 'done',
        planId: plan.id,
      });
    });
  }

  return {
    async getPlan(weekStart) {
      const plan = await findPlanByWeek(db, weekStart);
      if (!plan) {
        throw new NotFoundError(NO_SUCH_PLAN);
      }
      return plan;
    },

    listPlans(from, to) {
      return listPlans(db, from, to);
    },

    async createEmptyPlan(weekStart, actingUserId) {
      const servings = await defaultServings(db);
      const meals: NewMeal[] = daysOfWeek(weekStart).flatMap((date) =>
        MENU_SLOTS.map((slot) => ({
          date,
          slot,
          recipeId: null,
          why: null,
          servings,
        })),
      );
      return db.transaction(async (tx) => {
        await refuseTakenWeek(tx, weekStart);
        return insertPlan(
          tx,
          { weekStart, summary: null, createdBy: actingUserId },
          meals,
        );
      });
    },

    async deletePlan(id) {
      const plan = await findPlanSummary(db, id);
      if (!plan) {
        throw new NotFoundError(NO_SUCH_PLAN);
      }
      if (hasWeekStarted(plan.weekStart, now())) {
        throw new ConflictError(
          'Седмицата вече е започнала: менюто не може да се изтрие',
        );
      }
      await deletePlan(db, id);
    },

    async updateMeal(id, patch) {
      return db.transaction(async (tx) => {
        const current = await findMeal(tx, id);
        if (!current) {
          throw new NotFoundError(NO_SUCH_MEAL);
        }
        const recipeChanged =
          patch.recipeId !== undefined && patch.recipeId !== current.recipeId;
        if (
          recipeChanged &&
          patch.recipeId !== null &&
          patch.recipeId !== undefined &&
          !(await isMenuRecipe(tx, patch.recipeId, current.slot))
        ) {
          throw new InvalidReferenceError(
            'Рецептата не е в регистъра, архивирана е или не е за вечеря',
          );
        }
        await refuseUnknownUsers(tx, patch);
        await updateMeal(
          tx,
          id,
          current.planId,
          { ...patch, ...(recipeChanged ? { why: null } : {}) },
          now(),
        );
        const updated = await findMeal(tx, id);
        if (!updated) {
          throw new Error('meal vanished in its own transaction');
        }
        return updated;
      });
    },

    async requestProposal(params, actingUserId) {
      const gateway = openclaw;
      if (!gateway) {
        throw new OpenClawUnavailableError(
          'Предложенията не са достъпни: OpenClaw не е настроен',
        );
      }
      const have = await countMenuRecipes(db, DINNER);
      if (have < MENU_PROPOSE_MIN_RECIPES) {
        throw new ConflictError(
          `За предложение трябват поне ${MENU_PROPOSE_MIN_RECIPES} вечерни рецепти`,
          { code: 'not_enough_recipes', have, need: MENU_PROPOSE_MIN_RECIPES },
        );
      }
      const proposal = await db.transaction(async (tx) => {
        await refuseTakenWeek(tx, params.weekStart);
        return insertProposal(tx, params, actingUserId);
      });
      // The client polls GET …/proposals/:id.
      runs.start({
        contract: 'menu.propose',
        logContext: { proposalId: proposal.id },
        run: (signal) => runProposal(gateway, proposal, signal),
        fail: (code) =>
          finishProposal(db, proposal.id, { status: 'failed', error: code }),
      });
      return proposal;
    },

    async getProposal(id) {
      const proposal = await findProposal(db, id);
      if (!proposal) {
        throw new NotFoundError(NO_SUCH_PROPOSAL);
      }
      return proposal;
    },

    failStaleProposals() {
      return failPendingProposalsBefore(db, staleCutoff(), 'stale');
    },

    close() {
      return runs.close();
    },
  };
}

/**
 * „Днес се готви“ for `date` (a day in Sofia): the recipe title and id, or else the note, of that day's dinner, with its cook.
 * `null` without a plan for the day or for an empty meal. Lunch is not planned in phase 1.
 */
export async function readCooking(
  db: DbExecutor,
  date: string,
): Promise<{ lunch: CookingMeal | null; dinner: CookingMeal | null }> {
  const dinner = await findMealOn(db, date, DINNER);
  const title = dinner && mealTitle(dinner);
  return {
    lunch: null,
    dinner:
      dinner && title
        ? {
            title,
            recipeId: dinner.recipeId,
            cookUserId: dinner.cookUserId,
            servings: dinner.servings,
          }
        : null,
  };
}

/** Default servings of a new meal: 1 for each user. */
async function defaultServings(db: DbExecutor): Promise<Servings> {
  return oneServingEach((await listUsers(db)).map((user) => user.id));
}

/** The cook and the servings must name users; a 400 instead of a foreign key error. */
async function refuseUnknownUsers(
  db: DbExecutor,
  patch: UpdateMeal,
): Promise<void> {
  const named = [
    ...(patch.cookUserId ? [patch.cookUserId] : []),
    ...Object.keys(patch.servings ?? {}),
  ];
  if (named.length === 0) {
    return;
  }
  const known = new Set((await listUsers(db)).map((user) => user.id));
  if (named.some((id) => !known.has(id))) {
    throw new InvalidReferenceError('Няма такъв потребител');
  }
}
