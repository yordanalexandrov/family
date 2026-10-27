import { z } from 'zod';
import { slotSchema } from '../food/tags.js';
import { dateKeySchema } from '../schemas/dates.js';
import { mealCommentKindSchema } from '../schemas/menu.js';
import type { AiContract } from './contract.js';
import { menuProposeRecipeSchema } from './menu-propose.js';

/**
 * AI contract `meal.replace` („✨ Предложи друго“): the API assembles one meal, its thread (GLOSSARY: Разговор), the
 * rest of the week and the registry; the agent answers up to 3 other recipes from it, each with one sentence "why"
 * that says how it answers the thread. All in Bulgarian.
 */

/** Most candidates an answer has; the API refuses a request with fewer recipes to choose from. */
export const MEAL_REPLACE_MAX_CANDIDATES = 3;

const mealReplaceInputSchema = z.object({
  date: dateKeySchema,
  slot: slotSchema,
  /** What the meal is now; `title` is the recipe's (it is not among `recipes`). Empty for an empty meal. */
  current: z.object({
    recipeId: z.string().optional(),
    title: z.string().optional(),
    note: z.string().optional(),
  }),
  /** The meal's thread, oldest first; `author` is the user's name, a system line's `body` follows it. */
  thread: z.array(
    z.object({
      author: z.string(),
      body: z.string(),
      kind: mealCommentKindSchema,
    }),
  ),
  /** The other meals of the plan that have a title (recipe or note). */
  week: z.array(z.object({ date: dateKeySchema, title: z.string() })),
  /** Not archived, tagged with the slot, without the current recipe. */
  recipes: z.array(menuProposeRecipeSchema),
  /** Recipes of the meals of the 2 previous weeks, to avoid when the choice allows. */
  recentRecipeIds: z.array(z.string()),
});

export type MealReplaceInput = z.infer<typeof mealReplaceInputSchema>;

const mealReplaceCandidateSchema = z.object({
  recipeId: z.string().trim().min(1),
  why: z.string().trim().min(1),
});

const mealReplaceOutputSchema = z.object({
  candidates: z
    .array(mealReplaceCandidateSchema)
    .min(1)
    .max(MEAL_REPLACE_MAX_CANDIDATES),
});

export type MealReplaceOutput = z.infer<typeof mealReplaceOutputSchema>;

/** JSON Schema of the output for strict structured outputs; every field is required. */
const MEAL_REPLACE_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  mealReplaceOutputSchema,
  { io: 'output', unrepresentable: 'any' },
);

/**
 * What a schema cannot see, checked against the input after parsing: only recipes from the input, none twice. The
 * problems are in Bulgarian, for the retry message to the agent; an empty list means the answer is valid.
 */
export function validateReplacement(
  input: MealReplaceInput,
  output: MealReplaceOutput,
): string[] {
  const problems: string[] = [];
  const recipeIds = new Set(input.recipes.map((recipe) => recipe.id));
  const seen = new Set<string>();
  output.candidates.forEach((candidate, index) => {
    const at = `Кандидат ${index + 1}`;
    if (!recipeIds.has(candidate.recipeId)) {
      problems.push(
        `${at}: рецепта ${candidate.recipeId} не е от списъка recipes; избирай само от него.`,
      );
    } else if (seen.has(candidate.recipeId)) {
      problems.push(
        `${at}: рецепта ${candidate.recipeId} вече е предложена; без повторения.`,
      );
    }
    seen.add(candidate.recipeId);
  });
  return problems;
}

/**
 * `meal.replace`. The output for an input is {@link mealReplaceOutputSchema} with {@link validateReplacement} on top,
 * so an answer that breaks the rules goes through the same single retry as a malformed one.
 */
export const mealReplace: AiContract<MealReplaceInput, MealReplaceOutput> = {
  id: 'meal.replace',
  inputSchema: mealReplaceInputSchema,
  outputSchema: (input) =>
    mealReplaceOutputSchema.superRefine((output, ctx) => {
      for (const message of validateReplacement(input, output)) {
        ctx.addIssue({ code: 'custom', message });
      }
    }),
  responseFormat: {
    name: 'meal_replace',
    schema: MEAL_REPLACE_RESPONSE_JSON_SCHEMA,
  },
};
