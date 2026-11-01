import {
  type AppliedCookingChange,
  type AskCookingQuestion,
  applyCookingChanges,
  applyStepChanges,
  COOKING_HISTORY_MAX,
  type CookingAskInput,
  type CookingAskOutput,
  type CookingQuestion,
  type Recipe,
  recipeCookingLines,
  scaleCookingLine,
} from '@family/shared';
import { listEnabledApplianceNames } from '../db/repositories/appliances.js';
import {
  answeredBefore,
  findAppliedChanges,
  findCookingQuestion,
  findStoredCookingQuestion,
  hasPendingInChain,
  insertCookingQuestion,
  lockCookingChain,
  setCookingAnswer,
} from '../db/repositories/cooking-questions.js';
import { findRecipe } from '../db/repositories/recipes.js';
import { cookingQuestionRequest } from '../db/schema/food.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { ConflictError, InvalidActionError, NotFoundError } from './errors.js';

const NO_SUCH_RECIPE = 'Няма такава рецепта';
const NO_SUCH_STEP = 'Рецептата няма такава стъпка';
const NO_SUCH_EARLIER = 'Няма такъв предишен въпрос за рецептата';
const NO_SUCH_CHANGE = 'Няма такава промяна за готвенето на рецептата';
const CHAIN_WAITING = 'Предишният въпрос още чака отговор';

/** What a question is asked with: the recipe and what the cook sent. */
export interface CookingQuestionParams {
  recipeId: string;
  asked: AskCookingQuestion;
}

/**
 * „Питай“ in Готвене (GLOSSARY: Въпрос в Готвене): `cooking.ask` as AI requests, registered in `buildApp()` as
 * `app.cookingQuestions`. Asked with or without an acting user (the kiosk has none).
 */
export type CookingQuestions = ContractRequestHandle<
  CookingQuestionParams,
  CookingQuestion,
  string | null
>;

/** An earlier question of the chain and its answer, as the agent reads it. */
export type AskedBefore = CookingAskInput['history'][number];

/** What the run read when it started. */
interface Loaded {
  recipe: Recipe;
  appliances: string[];
  history: AskedBefore[];
  applied: AppliedCookingChange[];
}

/**
 * The input of `cooking.ask` for a question about `recipe`: its products after the applied cooking changes (`applied`,
 * in their order, the changed and removed lines marked) scaled to the servings on the screen (as Готвене shows them,
 * `scaleCookingLine`), its steps after the same changes numbered from 1 (the ones with new text marked) with the
 * current one by its number, its preparation, the enabled
 * appliances, the earlier questions of the chain with their answers (`history`, oldest first) and the question. Shared
 * with `ask:smoke`.
 */
export function cookingAskInput(
  recipe: Recipe,
  {
    question,
    step,
    servings,
  }: Pick<AskCookingQuestion, 'question' | 'step' | 'servings'>,
  appliances: string[],
  history: AskedBefore[] = [],
  applied: readonly AppliedCookingChange[] = [],
): CookingAskInput {
  const lines = applyCookingChanges(recipeCookingLines(recipe), applied);
  return {
    recipe: {
      title: recipe.title,
      servings: recipe.servings,
      shownServings: servings,
      ingredients: lines.map((line, index) => ({
        index,
        name: line.name,
        ...scaleCookingLine(line, servings),
        ...(line.note === undefined ? {} : { note: line.note }),
        ...(line.changed ? { changed: true as const } : {}),
        ...(line.removed ? { removed: true as const } : {}),
      })),
      steps: applyStepChanges(recipe.steps, applied).map((current, index) => ({
        number: index + 1,
        text: current.text,
        ...(current.changed ? { changed: true as const } : {}),
      })),
      preparation: recipe.preparation,
    },
    // The recipe may have lost steps since the question was asked.
    currentStep: Math.min(step, recipe.steps.length - 1) + 1,
    appliances,
    history,
    question,
  };
}

/**
 * How `cooking.ask` requests are stored: refused for an unknown recipe (404), a step it does not have (400), a `follows`
 * that is not a question of this recipe (404), an `applied` that is not a question of this recipe with a change (404)
 * and while a question of the chain still waits (409). The run reads the recipe, the last {@link COOKING_HISTORY_MAX}
 * answered questions of the chain and the applied changes from the database when it starts, never from the client;
 * the answer and its change are kept in the request and the recipe is never changed.
 */
export function createCookingQuestionStore(): ContractRequestStore<
  CookingQuestionParams,
  CookingQuestion,
  CookingAskInput,
  CookingAskOutput,
  string | null,
  undefined,
  Loaded
> {
  return {
    table: cookingQuestionRequest,

    async insert(tx, { recipeId, asked }, requestedBy) {
      const recipe = await findRecipe(tx, recipeId);
      if (!recipe) {
        throw new NotFoundError(NO_SUCH_RECIPE);
      }
      if (asked.step >= recipe.steps.length) {
        throw new InvalidActionError(NO_SUCH_STEP);
      }
      if (!(await findAppliedChanges(tx, recipeId, asked.applied))) {
        throw new NotFoundError(NO_SUCH_CHANGE);
      }
      if (asked.follows === undefined) {
        return insertCookingQuestion(tx, recipeId, asked, requestedBy);
      }
      const earlier = await findStoredCookingQuestion(tx, asked.follows);
      if (!earlier || earlier.recipeId !== recipeId) {
        throw new NotFoundError(NO_SUCH_EARLIER);
      }
      await lockCookingChain(tx, earlier.chainId);
      if (await hasPendingInChain(tx, earlier.chainId)) {
        throw new ConflictError(CHAIN_WAITING);
      }
      return insertCookingQuestion(
        tx,
        recipeId,
        asked,
        requestedBy,
        earlier.chainId,
      );
    },

    find: findCookingQuestion,

    async load(db, request) {
      const recipe = await findRecipe(db, request.recipeId);
      if (!recipe) {
        throw new Error('recipe of a cooking question vanished');
      }
      const stored = await findStoredCookingQuestion(db, request.id);
      return {
        recipe,
        appliances: await listEnabledApplianceNames(db),
        history: await answeredBefore(db, request, COOKING_HISTORY_MAX),
        applied:
          (await findAppliedChanges(
            db,
            request.recipeId,
            stored?.appliedIds ?? [],
          )) ?? [],
      };
    },

    async buildInput(_db, request, { recipe, appliances, history, applied }) {
      return cookingAskInput(recipe, request, appliances, history, applied);
    },

    async onDone(tx, request, output) {
      await setCookingAnswer(tx, request.id, output.answer, output.change);
    },
  };
}
