import { z } from 'zod';
import { prepTimeRangeSchema } from '../food/prep-time.js';
import { slotSchema, tagSchema } from '../food/tags.js';
import {
  checkPinchQuantity,
  quantitySchema,
  unitSchema,
} from '../food/units.js';
import { nutritionSchema } from '../schemas/recipe.js';
import { hintSchema } from './hint.js';

/**
 * AI contract `recipe.suggest` (GLOSSARY: AI контракт): fixed JSON in → 3–5 normalized recipes out,
 * validated in the API. Everything the agent writes is in Bulgarian.
 */

/** What the client asks for (GLOSSARY: Заявка за предложения). */
export const recipeSuggestParamsSchema = z.object({
  /** Any of these slots; each suggestion is for at least one of them. */
  slots: z.array(slotSchema).min(1),
  /** Any of these intervals of prep time; none means any time. */
  times: z.array(prepTimeRangeSchema).optional(),
  tags: z.array(tagSchema).optional(),
  hint: hintSchema.optional(),
});

export type RecipeSuggestParams = z.infer<typeof recipeSuggestParamsSchema>;

/** The contract input: the client request plus the registry context the API adds. */
export const recipeSuggestInputSchema = recipeSuggestParamsSchema.extend({
  existingRecipeTitles: z.array(z.string()),
  ingredientNames: z.array(z.string()),
});

export type RecipeSuggestInput = z.infer<typeof recipeSuggestInputSchema>;

/** An ingredient as the agent writes it: by name, `isNew` when it is not one of `ingredientNames`. */
export const suggestionIngredientSchema = z
  .object({
    name: z.string().trim().min(1),
    isNew: z.boolean(),
    quantity: quantitySchema,
    unit: unitSchema,
  })
  .superRefine(checkPinchQuantity);

export type SuggestionIngredient = z.infer<typeof suggestionIngredientSchema>;

/** One normalized recipe from the internet (GLOSSARY: Предложение за рецепта). */
export const suggestionSchema = z.object({
  title: z.string().trim().min(1),
  sourceUrl: z.url(),
  why: z.string().trim().min(1),
  prepMinutes: z.int().positive(),
  servings: z.int().min(1),
  tags: z.array(tagSchema),
  // A recipe really taken from its page has at least two of each; one line ("as in the source") is a placeholder.
  ingredients: z.array(suggestionIngredientSchema).min(2),
  steps: z.array(z.string().trim().min(1)).min(2),
  nutritionPer100g: nutritionSchema.optional(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

/** At most this many suggestions of one answer may come from the same site. */
export const MAX_SUGGESTIONS_PER_SITE = 2;

/** The site and page of a source URL, ignoring case, `www.`, a trailing slash, query and fragment. */
function sourceOf(url: string): { site: string; page: string } | null {
  // `shared` has no DOM or Node types, so no `URL`; the scheme and authority are already checked by `z.url()`.
  const match =
    /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^:/?#]+)(?::\d+)?([^?#]*)/i.exec(
      url,
    );
  if (!match) {
    return null;
  }
  const [, host = '', path = ''] = match;
  const site = host.toLowerCase().replace(/^www\./, '');
  return { site, page: `${site}${path.replace(/\/+$/, '').toLowerCase()}` };
}

/** Every suggestion is a different recipe from its own page, and the answer draws on more than one site. */
function checkDistinctSources(
  suggestions: Suggestion[],
  ctx: z.RefinementCtx,
): void {
  const pages = new Map<string, number>();
  const perSite = new Map<string, number>();
  suggestions.forEach((suggestion, index) => {
    const source = sourceOf(suggestion.sourceUrl);
    if (!source) {
      return;
    }
    const path = [index, 'sourceUrl'];
    const samePage = pages.get(source.page);
    if (samePage !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path,
        message: `Същата страница като предложение ${samePage + 1}: всяко предложение е отделна рецепта от своя страница.`,
      });
      return;
    }
    pages.set(source.page, index);
    const count = (perSite.get(source.site) ?? 0) + 1;
    perSite.set(source.site, count);
    if (count > MAX_SUGGESTIONS_PER_SITE) {
      ctx.addIssue({
        code: 'custom',
        path,
        message: `Повече от ${MAX_SUGGESTIONS_PER_SITE} предложения от ${source.site}: ползвай различни сайтове.`,
      });
    }
  });
}

export const recipeSuggestOutputSchema = z.object({
  suggestions: z
    .array(suggestionSchema)
    .min(3)
    .max(5)
    .superRefine(checkDistinctSources),
});

export type RecipeSuggestOutput = z.infer<typeof recipeSuggestOutputSchema>;

/**
 * The output as the agent writes it under strict structured outputs (`response_format.json_schema.strict: true`),
 * where every property is required and an optional one is sent as `null`. Only for the JSON Schema below.
 */
const recipeSuggestWireSchema = z.object({
  suggestions: z
    .array(
      suggestionSchema.extend({
        // `format: uri` is not supported in strict mode; the URL is still checked by `suggestionSchema`.
        sourceUrl: z.string(),
        nutritionPer100g: nutritionSchema.nullable(),
      }),
    )
    .min(3)
    .max(5),
});

/**
 * JSON Schema of the output for `response_format: { type: 'json_schema', strict: true }`: every object closed and
 * every property required, `nutritionPer100g` nullable. Refinements (a pinch has no quantity) are not expressible
 * there; the API still parses with {@link recipeSuggestAgentOutputSchema}.
 */
export const RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  recipeSuggestWireSchema,
  { io: 'output', unrepresentable: 'any' },
);

/** `nutritionPer100g: null` (how strict mode says "none") becomes absent; anything else is left for the contract. */
function withoutNullNutrition(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.suggestions)) {
    return value;
  }
  return {
    ...value,
    suggestions: value.suggestions.map((suggestion: unknown) => {
      if (!isRecord(suggestion) || suggestion.nutritionPer100g !== null) {
        return suggestion;
      }
      const { nutritionPer100g: _none, ...rest } = suggestion;
      return rest;
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The agent's answer parsed into {@link RecipeSuggestOutput}: accepts `nutritionPer100g: null` from strict mode as
 * well as the field left out, and otherwise refuses exactly what {@link recipeSuggestOutputSchema} refuses.
 */
export const recipeSuggestAgentOutputSchema = z.preprocess(
  withoutNullNutrition,
  recipeSuggestOutputSchema,
);
