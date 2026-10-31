import { z } from 'zod';
import { quantitySchema, unitSchema } from '../food/units.js';
import type { AiContract } from './contract.js';
import { IMPORT_TEXT_MAX } from './recipe-normalize.js';

/**
 * AI contract `recipe.refine` („Подобри рецептата“, GLOSSARY: Подобряване на рецепта): a recipe of the registry and, when
 * its source is a link that opened, the page read from it again → the recipe's steps written out in detail (one action
 * each, with amounts, heat, oven and a sign of doneness), its missing time, and photos of the page on the steps that
 * have none; or none and the reason in `noResults`. The title, products, tags and notes are not the agent's to change.
 * Everything the agent writes is in Bulgarian.
 *
 * Photos go as references only, never as URLs: the photos the recipe's steps have as `e1`, `e2`, … (in the order of the
 * steps), the page's as `s1`, `s2`, … (as in `recipe.normalize`). Every `e` photo stays, on exactly one step.
 */

/** An ingredient line as the agent reads it: the product's name, not its id; it changes no line. */
const refineIngredientSchema = z.object({
  name: z.string().trim().min(1),
  quantity: quantitySchema,
  unit: unitSchema,
  note: z.string().optional(),
});

/** A step: its text and the reference of its photo, an `e` one in the input, or `null`. */
const refineStepSchema = z.object({
  text: z.string().trim().min(1),
  image: z.string().trim().min(1).nullable(),
});

export type RefineStep = z.infer<typeof refineStepSchema>;

const refineRecipeSchema = z.object({
  title: z.string().trim().min(1),
  servings: z.int().min(1),
  prepMinutes: z.int().positive().nullable(),
  ingredients: z.array(refineIngredientSchema),
  steps: z.array(refineStepSchema).min(1),
});

/**
 * The page of the recipe's source as the api read it again (never the agent): its final URL, the JSON-LD Recipe (its
 * step photos as references) or the main text, and the references of its photos. At least one of `jsonLd` and `text`.
 */
const refineSourceSchema = z
  .object({
    url: z.url({ protocol: /^https?$/ }),
    jsonLd: z.unknown().optional(),
    text: z.string().trim().min(1).max(IMPORT_TEXT_MAX).optional(),
    photos: z.array(z.string().trim().min(1)),
  })
  .refine((page) => page.jsonLd !== undefined || page.text !== undefined, {
    message: 'Страницата е без jsonLd и без text.',
  });

const recipeRefineInputSchema = z.object({
  recipe: refineRecipeSchema,
  /** `null` for a recipe without a link, or with one whose page did not open. */
  source: refineSourceSchema.nullable(),
});

export type RecipeRefineInput = z.infer<typeof recipeRefineInputSchema>;

const refinementFields = {
  /** The recipe's own time when it has one; filled only when it has none and the source gives it. */
  prepMinutes: z.int().positive().nullable(),
  /** What changed and why, a sentence or two; shown above the comparison. */
  changes: z.string().trim().min(1),
};

const refinementSchema = z.object({
  ...refinementFields,
  steps: z.array(refineStepSchema).min(1),
});

export type Refinement = z.infer<typeof refinementSchema>;

/** Either a refinement or the reason there is none, never both. */
function checkAnswerShape(
  output: { recipe: Refinement | null; noResults: string | null },
  ctx: z.RefinementCtx,
): void {
  if ((output.recipe === null) === (output.noResults === null)) {
    ctx.addIssue({
      code: 'custom',
      path: ['noResults'],
      message:
        'Точно едно от recipe (подобрението) и noResults (защо няма какво да се подобри).',
    });
  }
}

const recipeRefineOutputSchema = z
  .object({
    recipe: refinementSchema.nullable(),
    /** Why there is nothing to refine, in Bulgarian; `null` when there is a refinement. */
    noResults: z.string().trim().min(1).nullable(),
  })
  .superRefine(checkAnswerShape);

export type RecipeRefineOutput = z.infer<typeof recipeRefineOutputSchema>;

/** JSON Schema of the output for strict structured outputs; every field is required, the rules below are not in it. */
const RECIPE_REFINE_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  z.object({
    recipe: z
      .object({
        ...refinementFields,
        steps: z.array(
          z.object({ text: z.string(), image: z.string().nullable() }),
        ),
      })
      .nullable(),
    noResults: z.string().nullable(),
  }),
  { io: 'output', unrepresentable: 'any' },
);

/** The photos the recipe's steps have, by their references in the input. */
export function recipePhotoRefs(input: RecipeRefineInput): string[] {
  return input.recipe.steps.flatMap((step) =>
    step.image === null ? [] : [step.image],
  );
}

/**
 * What a schema cannot see, checked against the input: every photo of the recipe on exactly one step, no photo twice,
 * only references of the input, and the recipe's own time kept. The problems are in Bulgarian, for the retry message
 * to the agent; an empty list means the refinement is valid.
 */
export function validateRefinement(
  input: RecipeRefineInput,
  refinement: Refinement,
): string[] {
  const problems: string[] = [];
  const own = recipePhotoRefs(input);
  const known = new Set([...own, ...(input.source?.photos ?? [])]);
  const count = new Map<string, number>();
  refinement.steps.forEach((step, index) => {
    if (step.image === null) {
      return;
    }
    if (!known.has(step.image)) {
      problems.push(
        `Стъпка ${index + 1}: снимка ${step.image} не е във входа; ползвай само референциите от recipe.steps и source.photos.`,
      );
    }
    count.set(step.image, (count.get(step.image) ?? 0) + 1);
  });
  for (const [ref, times] of count) {
    if (times > 1) {
      problems.push(
        `Снимка ${ref} е на ${times} стъпки; всяка снимка е най-много на една стъпка.`,
      );
    }
  }
  for (const ref of own) {
    if (!count.has(ref)) {
      problems.push(
        `Снимка ${ref} на рецептата липсва; сложи я на стъпката, която продължава старата.`,
      );
    }
  }
  const time = input.recipe.prepMinutes;
  if (time !== null && refinement.prepMinutes !== time) {
    problems.push(
      `prepMinutes е ${time} в рецептата и не се променя; върни ${time}.`,
    );
  }
  return problems;
}

/**
 * `recipe.refine`. The output for an input is {@link recipeRefineOutputSchema} with {@link validateRefinement} on top,
 * so an answer that loses a photo goes through the same single retry as a malformed one, and then fails
 * `invalid_output`: nothing is fixed quietly.
 */
export const recipeRefine: AiContract<RecipeRefineInput, RecipeRefineOutput> = {
  id: 'recipe.refine',
  inputSchema: recipeRefineInputSchema,
  outputSchema: (input) =>
    recipeRefineOutputSchema.superRefine((output, ctx) => {
      if (output.recipe === null) {
        return;
      }
      for (const message of validateRefinement(input, output.recipe)) {
        ctx.addIssue({ code: 'custom', path: ['recipe'], message });
      }
    }),
  responseFormat: {
    name: 'recipe_refine',
    schema: RECIPE_REFINE_RESPONSE_JSON_SCHEMA,
  },
};
