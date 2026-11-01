import {
  type AskCookingQuestion,
  type CookingAskInput,
  type CookingAskOutput,
  type CookingQuestion,
  type Recipe,
  scaleQuantity,
} from '@family/shared';
import { listEnabledApplianceNames } from '../db/repositories/appliances.js';
import {
  findCookingQuestion,
  insertCookingQuestion,
  setCookingAnswer,
} from '../db/repositories/cooking-questions.js';
import { findRecipe } from '../db/repositories/recipes.js';
import { cookingQuestionRequest } from '../db/schema/food.js';
import type {
  ContractRequestHandle,
  ContractRequestStore,
} from './contract-requests.js';
import { InvalidActionError, NotFoundError } from './errors.js';

const NO_SUCH_RECIPE = 'Няма такава рецепта';
const NO_SUCH_STEP = 'Рецептата няма такава стъпка';

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

/** What the run read when it started. */
interface Loaded {
  recipe: Recipe;
  appliances: string[];
}

/**
 * The input of `cooking.ask` for a question about `recipe`: its products scaled to the servings on the screen (as
 * Готвене shows them, `scaleQuantity`), its steps numbered from 1 with the current one by its number, its preparation,
 * the enabled appliances and the question. Shared with `ask:smoke`.
 *
 * The seams of the next tickets (#262): the chain of earlier questions (`follows`) and the applied cooking changes
 * (`applied`, applied in their order before scaling and marked as changed) go in here.
 */
export function cookingAskInput(
  recipe: Recipe,
  { question, step, servings }: AskCookingQuestion,
  appliances: string[],
): CookingAskInput {
  return {
    recipe: {
      title: recipe.title,
      servings: recipe.servings,
      shownServings: servings,
      ingredients: recipe.ingredients.map((line) => ({
        name: line.ingredient.name,
        ...scaleQuantity(line, recipe.servings, servings),
        ...(line.note === undefined ? {} : { note: line.note }),
      })),
      steps: recipe.steps.map((current, index) => ({
        number: index + 1,
        text: current.text,
      })),
      preparation: recipe.preparation,
    },
    // The recipe may have lost steps since the question was asked.
    currentStep: Math.min(step, recipe.steps.length - 1) + 1,
    appliances,
    question,
  };
}

/**
 * How `cooking.ask` requests are stored: refused for an unknown recipe (404) or a step it does not have (400). The run
 * reads the recipe from the database when it starts, never from the client; the answer is kept in the request and the
 * recipe is never changed.
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
      return insertCookingQuestion(tx, recipeId, asked, requestedBy);
    },

    find: findCookingQuestion,

    async load(db, request) {
      const recipe = await findRecipe(db, request.recipeId);
      if (!recipe) {
        throw new Error('recipe of a cooking question vanished');
      }
      return { recipe, appliances: await listEnabledApplianceNames(db) };
    },

    async buildInput(_db, request, { recipe, appliances }) {
      return cookingAskInput(recipe, request, appliances);
    },

    async onDone(tx, request, output) {
      await setCookingAnswer(tx, request.id, output.answer);
    },
  };
}
