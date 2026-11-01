import { z } from 'zod';
import {
  type CookingChange,
  cookingChangeSchema,
} from '../food/cooking-change.js';
import { preparationSchema } from '../food/preparation.js';
import { quantitySchema, unitSchema } from '../food/units.js';
import type { AiContract } from './contract.js';
import { isRecord, withoutNulls } from './strict-mode.js';

/**
 * AI contract `cooking.ask` (GLOSSARY: Въпрос в Готвене, ADR-0009): the recipe being cooked, with its products by the
 * servings on the screen, its numbered steps and preparation, the step the cook is on, the enabled appliances and a free
 * question → a short answer in Bulgarian for this recipe, step and servings. The agent (`family-cook`) has `web_search`
 * and `web_fetch` and searches only when its knowledge is not enough.
 *
 * A follow-up question brings up to {@link COOKING_HISTORY_MAX} earlier questions of its chain with their answers
 * (`history`, oldest first), so the agent reads it as a conversation.
 *
 * The recipe comes with the cooking changes applied on the screen (GLOSSARY: Промяна за готвенето): its lines by their
 * index, the ones a change replaced or added marked `changed`, the removed ones still in their place and marked
 * `removed`, and its steps by their number, the ones a change gave new text marked `changed`. The answer may bring a
 * `change` of its own: its products by those indices and new text for its steps by those numbers (steps are never
 * added or removed).
 */

/** Longest question a cook types; the sheet's field stops there. */
export const COOKING_QUESTION_MAX = 300;

/** Longest answer the agent may give: a few sentences, read standing at the stove. */
export const COOKING_ANSWER_MAX = 800;

/** How many earlier questions of the chain the agent sees. */
export const COOKING_HISTORY_MAX = 5;

/** The question as typed: trimmed, 1–300 characters. */
export const cookingQuestionTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(COOKING_QUESTION_MAX);

/**
 * An ingredient line as the agent reads it: its index (from 0, what a change names it by), the product's name and the
 * amount for the shown servings; `changed` when an applied change replaced or added it, `removed` when one removed it.
 */
const askIngredientSchema = z.object({
  index: z.int().min(0),
  name: z.string().trim().min(1),
  quantity: quantitySchema,
  unit: unitSchema,
  note: z.string().optional(),
  changed: z.literal(true).optional(),
  removed: z.literal(true).optional(),
});

/**
 * A step by its number on the screen („Стъпка 3 от 4“), from 1 (what a change names it by); `changed` when an applied
 * change gave it new text.
 */
const askStepSchema = z.object({
  number: z.int().min(1),
  text: z.string().trim().min(1),
  changed: z.literal(true).optional(),
});

const askRecipeSchema = z
  .object({
    title: z.string().trim().min(1),
    /** The servings the recipe is written for. */
    servings: z.int().min(1),
    /** The servings on the screen; the ingredients are already scaled to them. */
    shownServings: z.int().min(1),
    ingredients: z.array(askIngredientSchema),
    steps: z.array(askStepSchema).min(1),
    preparation: preparationSchema,
  })
  .refine(
    (recipe) => recipe.ingredients.every((line, at) => line.index === at),
    { path: ['ingredients'], message: 'Индексите на продуктите не са по ред.' },
  )
  .refine(
    (recipe) => recipe.steps.every((step, at) => step.number === at + 1),
    {
      path: ['steps'],
      message: 'Номерата на стъпките не са по ред.',
    },
  );

/** An earlier question of the chain and the answer it got. */
const askHistorySchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

const cookingAskInputSchema = z
  .object({
    recipe: askRecipeSchema,
    /** The number of the step on the screen. */
    currentStep: z.int().min(1),
    /** The enabled household appliances (GLOSSARY: Уред), by name. */
    appliances: z.array(z.string()),
    /** The earlier questions of the chain with their answers, oldest first; empty for the first question. */
    history: z.array(askHistorySchema).max(COOKING_HISTORY_MAX),
    question: cookingQuestionTextSchema,
  })
  .refine((input) => input.currentStep <= input.recipe.steps.length, {
    path: ['currentStep'],
    message: 'Текущата стъпка не е от стъпките на рецептата.',
  });

export type CookingAskInput = z.infer<typeof cookingAskInputSchema>;

const cookingAskOutputSchema = z.preprocess(
  (value) => (isRecord(value) ? withoutNulls(value, ['change']) : value),
  z.object({
    /** The answer, in Bulgarian, with amounts for the shown servings when they matter. */
    answer: z.string().trim().min(1).max(COOKING_ANSWER_MAX),
    /** A cooking change for a real substitution the cook would apply; `null` from the agent when there is none. */
    change: cookingChangeSchema.optional(),
  }),
);

export type CookingAskOutput = { answer: string; change?: CookingChange };

/** Every line and every step a change names is one of the input's recipe. */
function checkChangeLines(
  input: CookingAskInput,
  output: CookingAskOutput,
  ctx: z.RefinementCtx,
): void {
  output.change?.ingredients.forEach((entry, at) => {
    if (
      entry.kind !== 'add' &&
      entry.index >= input.recipe.ingredients.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['change', 'ingredients', at, 'index'],
        message: `Ред ${entry.index} го няма в продуктите на рецептата.`,
      });
    }
  });
  output.change?.steps.forEach((entry, at) => {
    if (entry.number > input.recipe.steps.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['change', 'steps', at, 'number'],
        message: `Стъпка ${entry.number} я няма в рецептата: стъпки не се добавят.`,
      });
    }
  });
}

/** A product of a change under strict structured outputs: the same fields, all required. */
const strictIngredient = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: unitSchema,
});

/** JSON Schema of the output for strict structured outputs; the length and line rules are not in it. */
const COOKING_ASK_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  z.object({
    answer: z.string(),
    change: z
      .object({
        ingredients: z.array(
          z.union([
            z.object({
              kind: z.literal('replace'),
              index: z.int(),
              ingredient: strictIngredient,
            }),
            z.object({ kind: z.literal('remove'), index: z.int() }),
            z.object({ kind: z.literal('add'), ingredient: strictIngredient }),
          ]),
        ),
        steps: z.array(z.object({ number: z.int(), text: z.string() })),
      })
      .nullable(),
  }),
  { io: 'output', unrepresentable: 'any' },
);

/**
 * `cooking.ask`. An empty or too long answer, or a change that names a line or a step the recipe does not have, has
 * two entries for one line or one step or changes nothing, goes through the client's single retry, then fails `invalid_output`.
 */
export const cookingAsk: AiContract<CookingAskInput, CookingAskOutput> = {
  id: 'cooking.ask',
  inputSchema: cookingAskInputSchema,
  outputSchema: (input) =>
    cookingAskOutputSchema.superRefine((output, ctx) =>
      checkChangeLines(input, output, ctx),
    ),
  responseFormat: {
    name: 'cooking_ask',
    schema: COOKING_ASK_RESPONSE_JSON_SCHEMA,
  },
};
