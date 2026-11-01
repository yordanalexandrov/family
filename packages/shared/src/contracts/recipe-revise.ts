import { z } from 'zod';
import { preparationSchema } from '../food/preparation.js';
import { checkPinchQuantity } from '../food/units.js';
import type { AiContract } from './contract.js';
import {
  preparationFromStrict,
  preparationStrictSchema,
} from './preparation.js';
import {
  checkOneProduct,
  normalizedIngredientFields,
  registryIngredientSchema,
} from './recipe-normalize.js';
import { recipePhotoRefs, refineRecipeSchema } from './recipe-refine.js';
import { stepImageProblems } from './step-images.js';
import { isRecord } from './strict-mode.js';

/**
 * AI contract `recipe.revise` (GLOSSARY: Поправка на рецепта, ADR-0011): a recipe, as `recipe.refine` reads it, and an
 * instruction in free text of what to change („картофите искат още 20 минути“) → the whole recipe with the changes
 * (products and amounts, steps, preparation, time and servings) and what changed; or none and the reason in
 * `noResults`. The title, tags and appliance are not in the output: the agent does not change them. Its products are
 * linked to the registry as in `recipe.normalize`; one the registry lacks is a proposed new product. Everything the
 * agent writes is in Bulgarian.
 */

/** Longest instruction of a revision. */
export const RECIPE_REVISION_INSTRUCTION_MAX = 500;

/** The instruction of a revision: 1–500 characters, trimmed. */
export const revisionInstructionSchema = z
  .string()
  .trim()
  .min(1)
  .max(RECIPE_REVISION_INSTRUCTION_MAX);

const recipeReviseInputSchema = z.object({
  recipe: refineRecipeSchema,
  instruction: revisionInstructionSchema,
  /**
   * The cooking changes applied in the last cooking of the recipe, one readable line each („вместо домат: консерва
   * pulp 400 g“, „стъпка 3: …“); `[]` when there are none.
   */
  cookingChanges: z.array(z.string().trim().min(1)),
  /** The whole registry, to link the lines to. */
  ingredients: z.array(registryIngredientSchema),
});

export type RecipeReviseInput = z.infer<typeof recipeReviseInputSchema>;

/** A line of the revised recipe: a registry product or a new one, as in `recipe.normalize`. */
const revisedIngredientSchema = z
  .object(normalizedIngredientFields)
  .superRefine(checkPinchQuantity)
  .superRefine(checkOneProduct);

export type RevisedIngredient = z.infer<typeof revisedIngredientSchema>;

const revisedStepSchema = z.object({
  text: z.string().trim().min(1),
  /** The reference of a photo of the recipe (`e1`, …) or `null`. */
  image: z.string().trim().min(1).nullable(),
});

const revisedRecipeFields = {
  /** What changed, a sentence or two; shown above the comparison. */
  changes: z.string().trim().min(1),
  servings: z.int().min(1),
  prepMinutes: z.int().positive().nullable(),
};

const revisedRecipeSchema = z.object({
  ...revisedRecipeFields,
  ingredients: z.array(revisedIngredientSchema),
  steps: z.array(revisedStepSchema).min(1),
  preparation: preparationSchema,
});

export type RevisedRecipe = z.infer<typeof revisedRecipeSchema>;

/** Either a revision or the reason there is none, never both. */
function checkAnswerShape(
  output: { recipe: RevisedRecipe | null; noResults: string | null },
  ctx: z.RefinementCtx,
): void {
  if ((output.recipe === null) === (output.noResults === null)) {
    ctx.addIssue({
      code: 'custom',
      path: ['noResults'],
      message:
        'Точно едно от recipe (поправената рецепта) и noResults (защо няма какво да се поправи).',
    });
  }
}

const recipeReviseOutputSchema = z
  .object({
    recipe: revisedRecipeSchema.nullable(),
    /** Why there is nothing to revise, in Bulgarian; `null` when there is a revision. */
    noResults: z.string().trim().min(1).nullable(),
  })
  .superRefine(checkAnswerShape);

export type RecipeReviseOutput = z.infer<typeof recipeReviseOutputSchema>;

/** JSON Schema of the output for strict structured outputs; every field is required, the rules below are not in it. */
const RECIPE_REVISE_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  z.object({
    recipe: z
      .object({
        ...revisedRecipeFields,
        ingredients: z.array(z.object(normalizedIngredientFields)),
        steps: z.array(
          z.object({ text: z.string(), image: z.string().nullable() }),
        ),
        preparation: preparationStrictSchema,
      })
      .nullable(),
    noResults: z.string().nullable(),
  }),
  { io: 'output', unrepresentable: 'any' },
);

/** `rack: null` and `minutesBefore: null` of the preparation (strict mode's "none") become absent. */
function fromStrictMode(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.recipe)) {
    return value;
  }
  return {
    ...value,
    recipe: {
      ...value.recipe,
      preparation: preparationFromStrict(value.recipe.preparation),
    },
  };
}

/**
 * What a schema cannot see, checked against the input: every `ingredientId` from the input's registry, and only the
 * recipe's own photos, each on at most one step (a photo may go with a step that is gone). In Bulgarian, for the retry.
 */
export function validateRevision(
  input: RecipeReviseInput,
  revision: RevisedRecipe,
): string[] {
  const ids = new Set(input.ingredients.map((ingredient) => ingredient.id));
  const problems = revision.ingredients.flatMap((line, index) =>
    line.ingredientId !== null && !ids.has(line.ingredientId)
      ? [
          `Продукт ${index + 1}: ${line.ingredientId} не е от ingredients във входа; свържи с id от там или предложи newProduct.`,
        ]
      : [],
  );
  const { problems: photos } = stepImageProblems(
    revision.steps,
    new Set(recipePhotoRefs(input)),
    'ползвай само референциите от recipe.steps',
  );
  return [...problems, ...photos];
}

/**
 * `recipe.revise`. The output for an input is {@link recipeReviseOutputSchema} with {@link validateRevision} on top, so
 * a foreign product or photo goes through the same single retry as a malformed answer, and then fails `invalid_output`.
 */
export const recipeRevise: AiContract<RecipeReviseInput, RecipeReviseOutput> = {
  id: 'recipe.revise',
  inputSchema: recipeReviseInputSchema,
  outputSchema: (input) =>
    z.preprocess(
      fromStrictMode,
      recipeReviseOutputSchema.superRefine((output, ctx) => {
        if (output.recipe === null) {
          return;
        }
        for (const message of validateRevision(input, output.recipe)) {
          ctx.addIssue({ code: 'custom', path: ['recipe'], message });
        }
      }),
    ),
  responseFormat: {
    name: 'recipe_revise',
    schema: RECIPE_REVISE_RESPONSE_JSON_SCHEMA,
  },
};
