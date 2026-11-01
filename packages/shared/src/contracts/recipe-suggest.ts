import { z } from 'zod';
import { prepTimeRangeSchema } from '../food/prep-time.js';
import { preparationSchema } from '../food/preparation.js';
import { slotSchema, tagSchema } from '../food/tags.js';
import {
  checkPinchQuantity,
  quantitySchema,
  unitSchema,
} from '../food/units.js';
import { nutritionSchema } from '../schemas/recipe.js';
import type { AiContract } from './contract.js';
import { hintSchema } from './hint.js';
import {
  preparationFromStrict,
  preparationStrictSchema,
} from './preparation.js';
import { isRecord, withoutNulls } from './strict-mode.js';

/**
 * AI contract `recipe.suggest` (GLOSSARY: AI контракт): fixed JSON in → 3–5 normalized recipes out, or none and
 * the reason in `noResults`, validated in the API. Everything the agent writes is in Bulgarian.
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

/** The contract input: the client request plus the registry context and the household appliances the API adds. */
const recipeSuggestInputSchema = recipeSuggestParamsSchema.extend({
  existingRecipeTitles: z.array(z.string()),
  ingredientNames: z.array(z.string()),
  /** The special appliances (GLOSSARY: Уред), a soft preference: the enabled ones of the household, from the `appliance` table. */
  appliances: z.array(z.string()),
});

export type RecipeSuggestInput = z.infer<typeof recipeSuggestInputSchema>;

/** An ingredient as the agent writes it: by name, `isNew` when it is not one of `ingredientNames`. */
const suggestionIngredientSchema = z
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
  /**
   * GLOSSARY: Подготовка — what the recipe has done before the first step or alongside it (the oven with its first
   * temperature, soaking, marinating…), without rewriting the steps; empty when there is nothing. Always present.
   */
  preparation: preparationSchema,
  /**
   * The household appliance (GLOSSARY: Уред) the recipe is for, exactly as one of the input's `appliances`; absent
   * when it is for the oven or the hob. Checked against the input by {@link checkAppliances}.
   */
  appliance: z.string().trim().min(1).optional(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

/** At most this many suggestions of one answer may come from the same site. */
const MAX_SUGGESTIONS_PER_SITE = 2;

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

/** A suggestion's `appliance` is one of the input's, by its exact name. */
function checkAppliances(
  input: RecipeSuggestInput,
  output: RecipeSuggestOutput,
  ctx: z.RefinementCtx,
): void {
  const known = new Set(input.appliances);
  output.suggestions.forEach((suggestion, index) => {
    if (suggestion.appliance === undefined || known.has(suggestion.appliance)) {
      return;
    }
    ctx.addIssue({
      code: 'custom',
      path: ['suggestions', index, 'appliance'],
      message:
        input.appliances.length === 0
          ? 'appliance е null: семейството няма включени уреди.'
          : `appliance е точно един от низовете в appliances (${input.appliances.map((name) => `„${name}“`).join(', ')}) или null.`,
    });
  });
}

/** An answer without `noResults` has this many suggestions. */
const MIN_SUGGESTIONS = 3;
const MAX_SUGGESTIONS = 5;

/** Either 3–5 suggestions and no `noResults`, or none and the reason in `noResults`: never placeholder records. */
function checkAnswerShape(
  output: { suggestions: Suggestion[]; noResults: string | null },
  ctx: z.RefinementCtx,
): void {
  if (output.noResults !== null) {
    if (output.suggestions.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['noResults'],
        message: `noResults е само с празен списък suggestions: или ${MIN_SUGGESTIONS}–${MAX_SUGGESTIONS} предложения, или нито едно и причината.`,
      });
    }
    return;
  }
  if (output.suggestions.length < MIN_SUGGESTIONS) {
    ctx.addIssue({
      code: 'custom',
      path: ['suggestions'],
      message: `Поне ${MIN_SUGGESTIONS} предложения; ако няма толкова, върни празен списък и причината в noResults.`,
    });
  }
}

const recipeSuggestOutputSchema = z
  .object({
    suggestions: z
      .array(suggestionSchema)
      .max(MAX_SUGGESTIONS)
      .superRefine(checkDistinctSources),
    /** Why there are no suggestions, in Bulgarian; `null` when there are. */
    noResults: z.string().trim().min(1).nullable(),
  })
  .superRefine(checkAnswerShape);

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
        appliance: z.string().nullable(),
        preparation: preparationStrictSchema,
      }),
    )
    // 0 for an answer with `noResults`; the 3–5 otherwise is checked by the contract only.
    .min(0)
    .max(MAX_SUGGESTIONS),
  noResults: z.string().nullable(),
});

/**
 * JSON Schema of the output for `response_format: { type: 'json_schema', strict: true }`: every object closed and
 * every property required, `nutritionPer100g`, `appliance`, `noResults` and the preparation's `rack` and
 * `minutesBefore` nullable. Refinements (3–5 suggestions without
 * `noResults`, a pinch has no quantity) are not expressible there; the API still parses with {@link recipeSuggestAgentOutputSchema}.
 */
const RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  recipeSuggestWireSchema,
  { io: 'output', unrepresentable: 'any' },
);

/**
 * How strict mode says "none" becomes absent: `nutritionPer100g: null` and `appliance: null` of a suggestion, and
 * `rack: null` and `minutesBefore: null` of its preparation items. Anything else is left for the contract.
 */
function fromStrictMode(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.suggestions)) {
    return value;
  }
  return {
    ...value,
    suggestions: value.suggestions.map((suggestion: unknown) => {
      if (!isRecord(suggestion)) {
        return suggestion;
      }
      return {
        ...withoutNulls(suggestion, ['nutritionPer100g', 'appliance']),
        preparation: preparationFromStrict(suggestion.preparation),
      };
    }),
  };
}

/**
 * The agent's answer parsed into {@link RecipeSuggestOutput}: accepts `nutritionPer100g: null`, `appliance: null` and
 * the preparation's `rack: null` and `minutesBefore: null` from strict mode as well as the fields left out, and otherwise refuses exactly what {@link recipeSuggestOutputSchema}
 * refuses.
 */
const recipeSuggestAgentOutputSchema = z.preprocess(
  fromStrictMode,
  recipeSuggestOutputSchema,
);

/**
 * `recipe.suggest`. The output for an input is {@link recipeSuggestAgentOutputSchema} with {@link checkAppliances}
 * against that input on top, so an appliance that is not one of the input goes through the same single retry.
 */
export const recipeSuggest: AiContract<
  RecipeSuggestInput,
  RecipeSuggestOutput
> = {
  id: 'recipe.suggest',
  inputSchema: recipeSuggestInputSchema,
  outputSchema: (input) =>
    recipeSuggestAgentOutputSchema.superRefine((output, ctx) =>
      checkAppliances(input, output, ctx),
    ),
  responseFormat: {
    name: 'recipe_suggest',
    schema: RECIPE_SUGGEST_RESPONSE_JSON_SCHEMA,
  },
};
