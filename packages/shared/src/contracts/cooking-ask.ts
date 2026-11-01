import { z } from 'zod';
import { preparationSchema } from '../food/preparation.js';
import { quantitySchema, unitSchema } from '../food/units.js';
import type { AiContract } from './contract.js';

/**
 * AI contract `cooking.ask` (GLOSSARY: Въпрос в Готвене, ADR-0009): the recipe being cooked, with its products by the
 * servings on the screen, its numbered steps and preparation, the step the cook is on, the enabled appliances and a free
 * question → a short answer in Bulgarian for this recipe, step and servings. The agent (`family-cook`) has `web_search`
 * and `web_fetch` and searches only when its knowledge is not enough.
 *
 * Not yet here (epic #270): the earlier questions of the chain (`follows`), the cooking changes applied to the recipe and
 * marked as changed (`applied`), and the optional `change` of the answer.
 */

/** Longest question a cook types; the sheet's field stops there. */
export const COOKING_QUESTION_MAX = 300;

/** Longest answer the agent may give: a few sentences, read standing at the stove. */
export const COOKING_ANSWER_MAX = 800;

/** The question as typed: trimmed, 1–300 characters. */
export const cookingQuestionTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(COOKING_QUESTION_MAX);

/** An ingredient line as the agent reads it: the product's name and the amount for the shown servings. */
const askIngredientSchema = z.object({
  name: z.string().trim().min(1),
  quantity: quantitySchema,
  unit: unitSchema,
  note: z.string().optional(),
});

/** A step by its number on the screen („Стъпка 3 от 4“), from 1. */
const askStepSchema = z.object({
  number: z.int().min(1),
  text: z.string().trim().min(1),
});

const askRecipeSchema = z.object({
  title: z.string().trim().min(1),
  /** The servings the recipe is written for. */
  servings: z.int().min(1),
  /** The servings on the screen; the ingredients are already scaled to them. */
  shownServings: z.int().min(1),
  ingredients: z.array(askIngredientSchema),
  steps: z.array(askStepSchema).min(1),
  preparation: preparationSchema,
});

const cookingAskInputSchema = z
  .object({
    recipe: askRecipeSchema,
    /** The number of the step on the screen. */
    currentStep: z.int().min(1),
    /** The enabled household appliances (GLOSSARY: Уред), by name. */
    appliances: z.array(z.string()),
    question: cookingQuestionTextSchema,
  })
  .refine((input) => input.currentStep <= input.recipe.steps.length, {
    path: ['currentStep'],
    message: 'Текущата стъпка не е от стъпките на рецептата.',
  });

export type CookingAskInput = z.infer<typeof cookingAskInputSchema>;

const cookingAskOutputSchema = z.object({
  /** The answer, in Bulgarian, with amounts for the shown servings when they matter. */
  answer: z.string().trim().min(1).max(COOKING_ANSWER_MAX),
});

export type CookingAskOutput = z.infer<typeof cookingAskOutputSchema>;

/** JSON Schema of the output for strict structured outputs; the length rules are not in it. */
const COOKING_ASK_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  z.object({ answer: z.string() }),
  { io: 'output', unrepresentable: 'any' },
);

/** `cooking.ask`. An empty or too long answer goes through the client's single retry, then fails `invalid_output`. */
export const cookingAsk: AiContract<CookingAskInput, CookingAskOutput> = {
  id: 'cooking.ask',
  inputSchema: cookingAskInputSchema,
  outputSchema: () => cookingAskOutputSchema,
  responseFormat: {
    name: 'cooking_ask',
    schema: COOKING_ASK_RESPONSE_JSON_SCHEMA,
  },
};
