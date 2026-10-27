import { z } from 'zod';
import { aisleSchema } from '../food/aisles.js';
import { tagSchema } from '../food/tags.js';
import {
  baseUnitSchema,
  checkPinchQuantity,
  quantitySchema,
  unitSchema,
} from '../food/units.js';
import { nutritionSchema } from '../schemas/recipe.js';
import type { AiContract } from './contract.js';

/**
 * AI contract `recipe.normalize` (GLOSSARY: Внасяне на рецепта): a foreign recipe (pasted text, a page the api
 * fetched by its link, or a photo sent next to the JSON as an image) and the whole ingredient registry in → exactly one normalized recipe with its lines linked to the
 * registry, or none and the reason in `noResults`. Everything the agent writes is in Bulgarian.
 */

/** Longest pasted text of an import. */
export const IMPORT_TEXT_MAX = 20_000;

/** Pasted recipe text and, optionally, the link it came from (kept as the recipe's source). */
const textSourceSchema = z.object({
  kind: z.literal('text'),
  text: z.string().trim().min(1).max(IMPORT_TEXT_MAX),
  url: z.url().optional(),
});

/** A web link the api may fetch: only `http` and `https`. */
const webUrlSchema = z.url({ protocol: /^https?$/ });

/**
 * A link to a recipe page; the api fetches it. `force` imports it again although it is already a recipe's source or a
 * proposed suggestion's (otherwise 409 `already_imported`).
 */
const urlParamsSchema = z.object({
  kind: z.literal('url'),
  url: webUrlSchema,
  force: z.boolean().optional(),
});

/**
 * What the client asks to import (GLOSSARY: Внасяне на рецепта), by kind of source: pasted text or a link. `photo` is
 * added by its own ticket.
 */
export const recipeImportParamsSchema = z.discriminatedUnion('kind', [
  textSourceSchema,
  urlParamsSchema,
]);

export type RecipeImportParams = z.infer<typeof recipeImportParamsSchema>;

/**
 * A page the api fetched by link (never the agent): its final URL (after redirects) and what the api extracted from
 * it, the schema.org `Recipe` of its JSON-LD (trimmed to the recipe's fields) or, without one, its main text. At least
 * one of the two.
 */
const pageSourceSchema = z
  .object({
    kind: z.literal('page'),
    url: webUrlSchema,
    jsonLd: z.unknown().optional(),
    text: z.string().trim().min(1).max(IMPORT_TEXT_MAX).optional(),
  })
  .refine((page) => page.jsonLd !== undefined || page.text !== undefined, {
    message: 'Страницата е без jsonLd и без text.',
  });

/**
 * A photo of a recipe (a cookbook page, a handwritten card, a screenshot). The picture itself is not in the JSON: it
 * goes with the input as an image part of the same message (`CompleteOptions.images` of the api's OpenClaw client);
 * a long screenshot as up to 8 parts, top to bottom (`importPhotoLayout`).
 */
const photoSourceSchema = z.object({ kind: z.literal('photo') });

/** Largest photo of an import, after the client has made it smaller (OpenClaw takes 10 MB per image). */
export const IMPORT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Largest all photos of one import together, the parts of a long screenshot (OpenClaw takes a 20 MB body). */
export const IMPORT_PHOTOS_MAX_BYTES = 20 * 1024 * 1024;

/** The media types a photo of an import may have; OpenClaw turns HEIC/HEIF into JPEG itself. */
export const IMPORT_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type ImportPhotoType = (typeof IMPORT_PHOTO_TYPES)[number];

/** The source as the agent gets it: pasted text as it is; a link as the page the api read from it; a photo. */
const normalizeSourceSchema = z.discriminatedUnion('kind', [
  textSourceSchema,
  pageSourceSchema,
  photoSourceSchema,
]);

export type RecipeNormalizeSource = z.infer<typeof normalizeSourceSchema>;

/** A registry ingredient as the agent sees it, to link lines to. */
const registryIngredientSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: baseUnitSchema,
});

const recipeNormalizeInputSchema = z.object({
  source: normalizeSourceSchema,
  /** The whole registry, unfiltered. */
  ingredients: z.array(registryIngredientSchema),
});

export type RecipeNormalizeInput = z.infer<typeof recipeNormalizeInputSchema>;

/** A product the registry lacks, as the agent proposes it; only the person creates it, on approval. */
const newProductSchema = z.object({
  /** Canonical: generic, in Bulgarian, singular, without brand. */
  name: z.string().trim().min(1),
  unit: baseUnitSchema,
  aisle: aisleSchema,
});

export type NewProduct = z.infer<typeof newProductSchema>;

const normalizedIngredientFields = {
  /** A registry ingredient of the input; `null` when the line proposes `newProduct` instead. */
  ingredientId: z.string().nullable(),
  newProduct: newProductSchema.nullable(),
  quantity: quantitySchema,
  unit: unitSchema,
  /** What the source said when it differs from the line: the original unit („1 чаша“), a kind („смлян“). */
  note: z.string().trim().min(1).nullable(),
};

/** Exactly one of `ingredientId` and `newProduct`. */
function checkOneProduct(
  line: { ingredientId: string | null; newProduct: NewProduct | null },
  ctx: z.RefinementCtx,
): void {
  if ((line.ingredientId === null) === (line.newProduct === null)) {
    ctx.addIssue({
      code: 'custom',
      message:
        'Точно едно от ingredientId (продукт от регистъра) и newProduct (нов продукт).',
    });
  }
}

const normalizedIngredientSchema = z
  .object(normalizedIngredientFields)
  .superRefine(checkPinchQuantity)
  .superRefine(checkOneProduct);

export type NormalizedIngredient = z.infer<typeof normalizedIngredientSchema>;

const normalizedRecipeFields = {
  title: z.string().trim().min(1),
  servings: z.int().min(1),
  prepMinutes: z.int().positive().nullable(),
  tags: z.array(tagSchema),
  /** What the agent assumed (servings of „4–6“, converted units); shown where a suggestion shows "why". May be empty. */
  assumptions: z.string().trim(),
  ingredients: z.array(normalizedIngredientSchema).min(1),
  steps: z.array(z.string().trim().min(1)).min(1),
};

/** The one recipe of an import (GLOSSARY: Предложение за рецепта), as stored and shown for review. */
export const normalizedRecipeSchema = z.object({
  ...normalizedRecipeFields,
  /** Only when the source gives it per 100 g; never converted or computed. */
  nutritionPer100g: nutritionSchema.optional(),
});

export type NormalizedRecipe = z.infer<typeof normalizedRecipeSchema>;

/** Either a recipe or the reason there is none, never both. */
function checkAnswerShape(
  output: { recipe: NormalizedRecipe | null; noResults: string | null },
  ctx: z.RefinementCtx,
): void {
  if (output.recipe !== null && output.noResults !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['noResults'],
      message: 'noResults е само с recipe: null: или рецепта, или причината.',
    });
  }
  if (output.recipe === null && output.noResults === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['recipe'],
      message:
        'Няма recipe: ако в текста няма рецепта, върни причината в noResults.',
    });
  }
}

const recipeNormalizeOutputSchema = z
  .object({
    recipe: normalizedRecipeSchema.nullable(),
    /** Why there is no recipe, in Bulgarian; `null` when there is one. */
    noResults: z.string().trim().min(1).nullable(),
  })
  .superRefine(checkAnswerShape);

export type RecipeNormalizeOutput = z.infer<typeof recipeNormalizeOutputSchema>;

/**
 * The output as the agent writes it under strict structured outputs: every property required, an optional one sent as
 * `null`. Only for the JSON Schema below.
 */
const recipeNormalizeWireSchema = z.object({
  recipe: z
    .object({
      ...normalizedRecipeFields,
      ingredients: z.array(z.object(normalizedIngredientFields)),
      steps: z.array(z.string()),
      nutritionPer100g: nutritionSchema.nullable(),
    })
    .nullable(),
  noResults: z.string().nullable(),
});

/**
 * JSON Schema of the output for `response_format: { type: 'json_schema', strict: true }`. The rules across fields
 * (one of `ingredientId`/`newProduct`, ids from the registry, a pinch without quantity, recipe or `noResults`) are not
 * expressible there; the API still parses with {@link recipeNormalize}'s `outputSchema`.
 */
const RECIPE_NORMALIZE_RESPONSE_JSON_SCHEMA = z.toJSONSchema(
  recipeNormalizeWireSchema,
  { io: 'output', unrepresentable: 'any' },
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `recipe.nutritionPer100g: null` (how strict mode says "none") becomes absent; anything else is left for the contract. */
function withoutNullNutrition(value: unknown): unknown {
  if (
    !isRecord(value) ||
    !isRecord(value.recipe) ||
    value.recipe.nutritionPer100g !== null
  ) {
    return value;
  }
  const { nutritionPer100g: _none, ...recipe } = value.recipe;
  return { ...value, recipe };
}

/** Every `ingredientId` is one of the registry ingredients of the input. */
function checkRegistryIds(input: RecipeNormalizeInput) {
  const ids = new Set(input.ingredients.map((ingredient) => ingredient.id));
  return (output: RecipeNormalizeOutput, ctx: z.RefinementCtx): void => {
    output.recipe?.ingredients.forEach((line, index) => {
      if (line.ingredientId !== null && !ids.has(line.ingredientId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['recipe', 'ingredients', index, 'ingredientId'],
          message: `Продукт ${line.ingredientId} не е от ingredients във входа: свържи с id от там или предложи newProduct.`,
        });
      }
    });
  };
}

/**
 * `recipe.normalize`. The output for an input is {@link recipeNormalizeOutputSchema} (with `nutritionPer100g: null`
 * read as none) and every `ingredientId` from that input's registry, so a foreign id fails parsing and goes through the
 * same single retry.
 */
export const recipeNormalize: AiContract<
  RecipeNormalizeInput,
  RecipeNormalizeOutput
> = {
  id: 'recipe.normalize',
  inputSchema: recipeNormalizeInputSchema,
  outputSchema: (input) =>
    z.preprocess(
      withoutNullNutrition,
      recipeNormalizeOutputSchema.superRefine(checkRegistryIds(input)),
    ),
  responseFormat: {
    name: 'recipe_normalize',
    schema: RECIPE_NORMALIZE_RESPONSE_JSON_SCHEMA,
  },
};
