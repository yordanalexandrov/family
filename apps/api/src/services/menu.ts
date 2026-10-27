import {
  type CookingMeal,
  type CreateMenuProposal,
  dateKeyInSofia,
  daysOfWeek,
  hasWeekStarted,
  isPastMeal,
  MENU_PROPOSE_MIN_RECIPES,
  MENU_SLOTS,
  type Meal,
  type MealComment,
  type MealPlan,
  type MealPlanSummary,
  type MenuProposalRequest,
  type MenuProposeInput,
  type MenuProposeOutput,
  type MenuSlot,
  mealTitle,
  oneServingEach,
  type Servings,
  systemLine,
  type ThreadEvent,
  type UpdateMeal,
  type VoteValue,
} from '@family/shared';
import type { Db, DbExecutor } from '../db/client.js';
import {
  deleteComment,
  deleteOtherVotes,
  deletePlan,
  deleteVote,
  findComment,
  findMeal,
  findMealOn,
  findPlanByWeek,
  findPlanSummary,
  findProposal,
  hasPendingProposal,
  insertComment,
  insertPlan,
  insertProposal,
  listComments,
  listPlans,
  listProposalsOfWeek,
  lockWeek,
  type NewMeal,
  setProposalPlan,
  swapMealDates,
  updateMeal,
  upsertVote,
} from '../db/repositories/menu.js';
import { listUseUp } from '../db/repositories/pantry.js';
import {
  countMenuRecipes,
  isMenuRecipe,
  listMenuRecipes,
} from '../db/repositories/recipes.js';
import { listUsers } from '../db/repositories/users.js';
import { menuProposalRequest } from '../db/schema/menu.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidActionError,
  InvalidReferenceError,
  NotFoundError,
} from './errors.js';
import { type EventBus, menuAndShoppingChanged } from './events.js';

/** The slot phase 1 plans, and the one „Днес се готви“ shows; typed so it cannot leave `MENU_SLOTS` unnoticed. */
const DINNER: MenuSlot = 'dinner';

const NO_SUCH_PLAN = 'Няма меню за тази седмица';
/** Shared with `meal.replace` (`services/meal-replacements.ts`). */
export const NO_SUCH_MEAL = 'Няма такова ястие';
const NO_SUCH_PROPOSAL = 'Няма такова предложение за меню';
const WEEK_HAS_PLAN = 'Седмицата вече има меню';
const WEEK_HAS_PENDING = 'За седмицата вече се подготвя предложение';
const PAST_MEAL = 'Денят е минал: ястието вече не се гласува и не се сменя';
const NO_SUCH_COMMENT = 'Няма такъв коментар';
const PAST_MEAL_THREAD = 'Денят е минал: в разговора вече не се пише';
const NOT_YOUR_COMMENT = 'Можеш да изтриеш само свой коментар';
const SYSTEM_LINE = 'Редовете за промените не се трият';
const NOT_SWAPPABLE = 'Разменят се само ястия от едно меню и едно хранене';

export interface MenuService {
  /** The plan of the week with its meals. */
  getPlan(weekStart: string): Promise<MealPlan>;
  listPlans(from: string, to: string): Promise<MealPlanSummary[]>;
  /** A plan of empty meals: no recipe, no cook, one serving for each user. */
  createEmptyPlan(weekStart: string, actingUserId: string): Promise<MealPlan>;
  /** Only until the week has begun (Monday 00:00 in Sofia); after that the plan is edited live. */
  deletePlan(id: string): Promise<void>;
  /**
   * A changed recipe must be in the registry, not archived, tagged `dinner`; its `why` is the one of the picked
   * `meal.replace` candidate, or none when it was picked by hand. A changed recipe or note (GLOSSARY: Глас) drops the others' votes and makes `actingUserId` up; refused for a past meal.
   */
  updateMeal(
    id: string,
    patch: UpdateMeal,
    actingUserId: string,
  ): Promise<Meal>;
  /** Puts (`value`) or takes back (`null`) the vote of `actingUserId`; refused for a past meal. Signals only `menu.changed`. */
  vote(
    id: string,
    actingUserId: string,
    value: VoteValue | null,
  ): Promise<Meal>;
  /**
   * Swaps the days of two meals of one plan and slot (400 otherwise; 409 `past_meal` if either is past). Votes and
   * threads go with the meals; each gets a `moved` line by `actingUserId`. Returns the plan.
   */
  swapMeals(
    id: string,
    withMealId: string,
    actingUserId: string,
  ): Promise<MealPlan>;
  /** The meal's thread (GLOSSARY: Разговор), oldest first; readable for a past meal too. */
  listComments(mealId: string): Promise<MealComment[]>;
  /** A comment of `actingUserId`; refused for a past meal. Signals only `menu.changed`. */
  addComment(
    mealId: string,
    actingUserId: string,
    body: string,
  ): Promise<MealComment>;
  /** Only the author's own `comment`: 403 for someone else's, 409 for a system line or a past meal. Signals only `menu.changed`. */
  deleteComment(id: string, actingUserId: string): Promise<void>;
  /** Stores a `pending` proposal and starts `menu.propose` in the background; the proposal is returned at once. */
  requestProposal(
    params: CreateMenuProposal,
    actingUserId: string,
  ): Promise<MenuProposalRequest>;
  getProposal(id: string): Promise<MenuProposalRequest>;
  /** The newest proposal of the week, by a user or the cron; 404 without one. */
  getLatestProposal(weekStart: string): Promise<MenuProposalRequest>;
}

/** `menu.propose` as AI requests (GLOSSARY: Предложение за меню), registered in `buildApp()`. */
export type MenuProposals = ContractRequestHandle<
  CreateMenuProposal,
  MenuProposalRequest,
  string | null
>;

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

/** Signals a change to the plan of the week, or to the content of one of its meals, once it has committed. */
function signalWeek(events: EventBus, weekStart: string): void {
  for (const event of menuAndShoppingChanged(weekStart)) {
    events.publish(event);
  }
}

/** Signals a vote or a thread line once it has committed: the shopping list is not computed from them. */
function signalAgreement(events: EventBus, weekStart: string): void {
  events.publish({ type: 'menu.changed', weekStart });
}

/**
 * How `menu.propose` requests are stored: refused without enough dinner recipes or for a taken week; the input is the
 * dinner registry (with ratings and the last serving before the week) and the use-up products; a valid answer becomes
 * the week's plan, signalled on `events`.
 * A request without a user (`null`) is the cron's (`services/menu-schedule.ts`), and so is the plan it makes.
 */
export function createMenuProposalStore(
  events: EventBus,
): ContractRequestStore<
  CreateMenuProposal,
  MenuProposalRequest,
  MenuProposeInput,
  MenuProposeOutput,
  string | null
> {
  return {
    table: menuProposalRequest,

    async insert(tx, params, requestedBy) {
      const have = await countMenuRecipes(tx, DINNER);
      if (have < MENU_PROPOSE_MIN_RECIPES) {
        throw new ConflictError(
          `За предложение трябват поне ${MENU_PROPOSE_MIN_RECIPES} вечерни рецепти`,
          { code: 'not_enough_recipes', have, need: MENU_PROPOSE_MIN_RECIPES },
        );
      }
      await refuseTakenWeek(tx, params.weekStart);
      return insertProposal(tx, params, requestedBy);
    },

    find: findProposal,

    async buildInput(db, proposal) {
      return {
        weekStart: proposal.weekStart,
        slots: [...MENU_SLOTS],
        recipes: await listMenuRecipes(db, DINNER, proposal.weekStart),
        useUp: await listUseUp(db),
        hint: proposal.hint,
      };
    },

    async onDone(tx, proposal, output) {
      const servings = await defaultServings(tx);
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
      await setProposalPlan(tx, proposal.id, plan.id);
    },

    afterDone(proposal) {
      signalWeek(events, proposal.weekStart);
    },
  };
}

/**
 * The weekly menu (GLOSSARY: Седмично меню, Ястие, Предложение за меню); created once in `buildApp()` as `app.menu`.
 * Proposals go through `proposals`, the `menu.propose` requests registered with {@link createMenuProposalStore}. Every
 * committed change to a plan or a meal signals `menu.changed` and `shopping.changed` for its week on `events`; a vote or
 * a thread line only `menu.changed`.
 */
export function createMenuService({
  db,
  proposals,
  now,
  events,
}: {
  db: Db;
  proposals: MenuProposals;
  now: () => Date;
  events: EventBus;
}): MenuService {
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
      const plan = await db.transaction(async (tx) => {
        await refuseTakenWeek(tx, weekStart);
        return insertPlan(
          tx,
          { weekStart, summary: null, createdBy: actingUserId },
          meals,
        );
      });
      signalWeek(events, weekStart);
      return plan;
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
      signalWeek(events, plan.weekStart);
    },

    async updateMeal(id, patch, actingUserId) {
      const { meal, weekStart } = await db.transaction(async (tx) => {
        const current = await findMeal(tx, id);
        if (!current) {
          throw new NotFoundError(NO_SUCH_MEAL);
        }
        const recipeChanged =
          patch.recipeId !== undefined && patch.recipeId !== current.recipeId;
        const noteChanged =
          patch.note !== undefined && patch.note !== current.note;
        const contentChanged = recipeChanged || noteChanged;
        if (contentChanged) {
          refusePastMeal(current, now());
        }
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
        // The why of a picked `meal.replace` candidate comes with its recipe; a recipe picked by hand has none.
        const { why, ...values } = patch;
        await updateMeal(
          tx,
          id,
          current.planId,
          { ...values, ...(recipeChanged ? { why: why ?? null } : {}) },
          now(),
        );
        if (contentChanged) {
          await recordContentChange(tx, current, actingUserId, now());
        }
        return reread(tx, id, current.planId);
      });
      signalWeek(events, weekStart);
      return meal;
    },

    async vote(id, actingUserId, value) {
      const { meal, weekStart } = await db.transaction(async (tx) => {
        const current = await findMeal(tx, id);
        if (!current) {
          throw new NotFoundError(NO_SUCH_MEAL);
        }
        refusePastMeal(current, now());
        if (value === null) {
          await deleteVote(tx, id, actingUserId);
        } else {
          await upsertVote(tx, id, actingUserId, value, now());
        }
        return reread(tx, id, current.planId);
      });
      signalAgreement(events, weekStart);
      return meal;
    },

    async swapMeals(id, withMealId, actingUserId) {
      const plan = await db.transaction(async (tx) => {
        const a = await findMeal(tx, id);
        const b = await findMeal(tx, withMealId);
        if (!a || !b) {
          throw new NotFoundError(NO_SUCH_MEAL);
        }
        if (a.id === b.id || a.planId !== b.planId || a.slot !== b.slot) {
          throw new InvalidActionError(NOT_SWAPPABLE);
        }
        refusePastMeal(a, now());
        refusePastMeal(b, now());
        const at = now();
        await swapMealDates(tx, a, b, at);
        const moved = (from: Meal, to: Meal) =>
          writeSystemLine(
            tx,
            from.id,
            actingUserId,
            { type: 'moved', fromDate: from.date, toDate: to.date },
            at,
          );
        await moved(a, b);
        await moved(b, a);
        const plan = await findPlanByWeek(tx, await weekOf(tx, a.planId));
        if (!plan) {
          throw new Error('plan of a meal vanished');
        }
        return plan;
      });
      signalWeek(events, plan.weekStart);
      return plan;
    },

    async listComments(mealId) {
      if (!(await findMeal(db, mealId))) {
        throw new NotFoundError(NO_SUCH_MEAL);
      }
      return listComments(db, mealId);
    },

    async addComment(mealId, actingUserId, body) {
      const { comment, weekStart } = await db.transaction(async (tx) => {
        const meal = await findMeal(tx, mealId);
        if (!meal) {
          throw new NotFoundError(NO_SUCH_MEAL);
        }
        refusePastThread(meal, now());
        const comment = await insertComment(
          tx,
          { mealId, kind: 'comment', authorUserId: actingUserId, body },
          now(),
        );
        return { comment, weekStart: await weekOf(tx, meal.planId) };
      });
      signalAgreement(events, weekStart);
      return comment;
    },

    async deleteComment(id, actingUserId) {
      const weekStart = await db.transaction(async (tx) => {
        const comment = await findComment(tx, id);
        if (!comment) {
          throw new NotFoundError(NO_SUCH_COMMENT);
        }
        if (comment.kind === 'system') {
          throw new ConflictError(SYSTEM_LINE, { code: 'system_line' });
        }
        if (comment.authorUserId !== actingUserId) {
          throw new ForbiddenError(NOT_YOUR_COMMENT);
        }
        const meal = await findMeal(tx, comment.mealId);
        if (!meal) {
          throw new Error('meal of a comment vanished');
        }
        refusePastThread(meal, now());
        await deleteComment(tx, id);
        return weekOf(tx, meal.planId);
      });
      signalAgreement(events, weekStart);
    },

    requestProposal(params, actingUserId) {
      return proposals.request(params, actingUserId);
    },

    async getProposal(id) {
      const proposal = await proposals.get(id);
      if (!proposal) {
        throw new NotFoundError(NO_SUCH_PROPOSAL);
      }
      return proposal;
    },

    async getLatestProposal(weekStart) {
      const [latest] = await listProposalsOfWeek(db, weekStart);
      if (!latest) {
        throw new NotFoundError(NO_SUCH_PROPOSAL);
      }
      return latest;
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

/**
 * 409 `past_meal` for a meal before today in Sofia: its votes, recipe and note are history. Shared with `meal.replace`
 * (`services/meal-replacements.ts`), so both answer with one message.
 */
export function refusePastMeal(meal: Meal, at: Date): void {
  if (isPastMeal(meal, dateKeyInSofia(at))) {
    throw new ConflictError(PAST_MEAL, { code: 'past_meal' });
  }
}

/** 409 `past_meal` for writing to or deleting from the thread of a past meal: it is read, but not written. */
function refusePastThread(meal: Meal, at: Date): void {
  if (isPastMeal(meal, dateKeyInSofia(at))) {
    throw new ConflictError(PAST_MEAL_THREAD, { code: 'past_meal' });
  }
}

/**
 * Writes a system line (GLOSSARY: Разговор) for a change `actingUserId` made to a meal, in the transaction of the
 * change and at its time: `replaced` for its recipe or note, `moved` for a swap of days.
 */
export function writeSystemLine(
  tx: DbExecutor,
  mealId: string,
  actingUserId: string,
  event: ThreadEvent,
  at: Date,
): Promise<MealComment> {
  return insertComment(
    tx,
    {
      mealId,
      kind: 'system',
      authorUserId: actingUserId,
      body: systemLine(event),
    },
    at,
  );
}

/**
 * What follows a new recipe or note of a meal, in the transaction that wrote it (GLOSSARY: Глас, Разговор): the
 * others' votes are dropped, `actingUserId` votes up, and the thread gets a `replaced` line from `before`'s title to
 * the meal's title now. The caller has refused a past meal and written the new content.
 */
export async function recordContentChange(
  tx: DbExecutor,
  before: Meal,
  actingUserId: string,
  at: Date,
): Promise<void> {
  const after = await findMeal(tx, before.id);
  if (!after) {
    throw new Error('meal vanished in its own transaction');
  }
  await deleteOtherVotes(tx, before.id, actingUserId);
  await upsertVote(tx, before.id, actingUserId, 'up', at);
  await writeSystemLine(
    tx,
    before.id,
    actingUserId,
    { type: 'replaced', from: mealTitle(before), to: mealTitle(after) },
    at,
  );
}

async function weekOf(tx: DbExecutor, planId: string): Promise<string> {
  const plan = await findPlanSummary(tx, planId);
  if (!plan) {
    throw new Error('plan of a meal vanished');
  }
  return plan.weekStart;
}

/** The meal as its own transaction left it, with the week to signal. */
async function reread(
  tx: DbExecutor,
  id: string,
  planId: string,
): Promise<{ meal: Meal; weekStart: string }> {
  const meal = await findMeal(tx, id);
  const plan = await findPlanSummary(tx, planId);
  if (!meal || !plan) {
    throw new Error('meal vanished in its own transaction');
  }
  return { meal, weekStart: plan.weekStart };
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
