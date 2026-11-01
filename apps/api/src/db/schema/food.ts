import {
  type Aisle,
  aisleSchema,
  type BaseUnit,
  baseUnitSchema,
  contractRequestStatusSchema,
  type ImportPayload,
  type Nutrition,
  type Preparation,
  type PrepTimeRange,
  prepTimeRangeSchema,
  type RecipeImportSource,
  type RecipeRefinement,
  type RecipeStep,
  type RecipeSuggestionStatus,
  recipeImportSourceSchema,
  recipeSuggestionStatusSchema,
  type Slot,
  type SuggestionPayload,
  slotSchema,
  type Tag,
  tagSchema,
  type Unit,
  unitSchema,
} from '@family/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { literals, oneOf } from './checks.js';
import { contractRequestColumns, createdAt } from './columns.js';
import { user } from './user.js';

/** A generic ingredient (GLOSSARY: Продукт); the canonical name is unique ignoring case and outer spaces. */
export const ingredient = pgTable(
  'ingredient',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    unit: text('unit').$type<BaseUnit>().notNull(),
    aisle: text('aisle').$type<Aisle>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('ingredient_name_key').on(sql`lower(trim(${t.name}))`),
    check('ingredient_unit_check', oneOf(t.unit, baseUnitSchema.options)),
    check('ingredient_aisle_check', oneOf(t.aisle, aisleSchema.options)),
  ],
);

/** A recipe in the registry (GLOSSARY: Рецепта); `steps` is a JSON array of `RecipeStep` objects. */
export const recipe = pgTable(
  'recipe',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    servings: integer('servings').notNull(),
    steps: jsonb('steps').$type<RecipeStep[]>().notNull(),
    sourceUrl: text('source_url'),
    prepMinutes: integer('prep_minutes'),
    tags: text('tags').array().$type<Tag[]>().notNull().default(sql`'{}'`),
    nutritionPer100g: jsonb('nutrition_per_100g').$type<Nutrition>(),
    /** GLOSSARY: Уред. The appliance's name as text, not a reference: removing the appliance keeps it here. */
    appliance: text('appliance'),
    /** GLOSSARY: Подготовка. A JSON array of `PreparationItem`; recipes from before it have `[]`. */
    preparation: jsonb('preparation')
      .$type<Preparation>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /** GLOSSARY: Оценка. 1–5 stars, one for the family; `null` = unrated. Not part of `RecipeInput`. */
    rating: smallint('rating'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('recipe_archived_at_idx').on(t.archivedAt),
    check('recipe_servings_check', sql`${t.servings} >= 1`),
    check('recipe_rating_check', sql`${t.rating} between 1 and 5`),
    check(
      'recipe_tags_check',
      sql`${t.tags} <@ array[${literals(tagSchema.options)}]::text[]`,
    ),
  ],
);

/** One ingredient line of a recipe, in `position` order; `quantity` is null for a pinch. */
export const recipeIngredient = pgTable(
  'recipe_ingredient',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredient.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    // numeric comes back as a string from pg; map to number in the repository.
    quantity: numeric('quantity'),
    unit: text('unit').$type<Unit>().notNull(),
    note: text('note'),
  },
  (t) => [
    uniqueIndex('recipe_ingredient_position_key').on(t.recipeId, t.position),
    check('recipe_ingredient_unit_check', oneOf(t.unit, unitSchema.options)),
    check(
      'recipe_ingredient_pinch_check',
      sql`${t.unit} <> 'pinch' or ${t.quantity} is null`,
    ),
  ],
);

/** One run of `recipe.suggest` (GLOSSARY: Заявка за предложения). */
export const recipeSuggestionRequest = pgTable(
  'recipe_suggestion_request',
  {
    ...contractRequestColumns(),
    slots: text('slots').array().$type<Slot[]>().notNull(),
    times: text('times')
      .array()
      .$type<PrepTimeRange[]>()
      .notNull()
      .default(sql`'{}'`),
    tags: text('tags').array().$type<Tag[]>().notNull().default(sql`'{}'`),
  },
  (t) => [
    check(
      'recipe_suggestion_request_slots_check',
      sql`cardinality(${t.slots}) > 0 and ${t.slots} <@ array[${literals(slotSchema.options)}]::text[]`,
    ),
    check(
      'recipe_suggestion_request_times_check',
      sql`${t.times} <@ array[${literals(prepTimeRangeSchema.options)}]::text[]`,
    ),
    check(
      'recipe_suggestion_request_status_check',
      oneOf(t.status, contractRequestStatusSchema.options),
    ),
    check(
      'recipe_suggestion_request_tags_check',
      sql`${t.tags} <@ array[${literals(tagSchema.options)}]::text[]`,
    ),
  ],
);

/**
 * One run of `recipe.normalize` (GLOSSARY: Внасяне на рецепта). The source is kept with the request (the pasted text,
 * the link) for a retry and for debugging; `hint` of the common columns is unused.
 */
export const recipeImportRequest = pgTable(
  'recipe_import_request',
  {
    ...contractRequestColumns(),
    source: text('source').$type<RecipeImportSource>().notNull(),
    url: text('url'),
    text: text('text'),
    /** The agent's reason when it found no recipe (`failed`/`no_results`). */
    noResults: text('no_results'),
  },
  (t) => [
    check(
      'recipe_import_request_status_check',
      oneOf(t.status, contractRequestStatusSchema.options),
    ),
    check(
      'recipe_import_request_source_check',
      oneOf(t.source, recipeImportSourceSchema.options),
    ),
  ],
);

/**
 * One suggested recipe (GLOSSARY: Предложение за рецепта), of exactly one AI request: a suggestion request
 * (`request_id`, `payload` a `SuggestionPayload`) or an import (`import_request_id`, `payload` an `ImportPayload`).
 * Both payloads keep the contract's recipe with its steps as `RecipeStep` objects.
 */
export const recipeSuggestion = pgTable(
  'recipe_suggestion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id').references(() => recipeSuggestionRequest.id, {
      onDelete: 'cascade',
    }),
    importRequestId: uuid('import_request_id').references(
      () => recipeImportRequest.id,
      { onDelete: 'cascade' },
    ),
    position: integer('position').notNull(),
    payload: jsonb('payload')
      .$type<SuggestionPayload | ImportPayload>()
      .notNull(),
    status: text('status')
      .$type<RecipeSuggestionStatus>()
      .notNull()
      .default('proposed'),
    recipeId: uuid('recipe_id').references(() => recipe.id),
    decidedBy: uuid('decided_by').references(() => user.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('recipe_suggestion_position_key').on(t.requestId, t.position),
    // An import has exactly one suggestion.
    uniqueIndex('recipe_suggestion_import_request_key').on(t.importRequestId),
    check(
      'recipe_suggestion_status_check',
      oneOf(t.status, recipeSuggestionStatusSchema.options),
    ),
    check(
      'recipe_suggestion_request_check',
      sql`num_nonnulls(${t.requestId}, ${t.importRequestId}) = 1`,
    ),
  ],
);

/**
 * One run of `recipe.refine` for a recipe („Подобри рецептата“, GLOSSARY: Подобряване на рецепта); `refinement` is
 * written when it is `done`, `no_results` keeps the agent's reason. It goes with the recipe; at most one `pending` per
 * recipe. The recipe changes only when the person saves the form; `hint` of the common columns is unused.
 */
export const recipeRefineRequest = pgTable(
  'recipe_refine_request',
  {
    ...contractRequestColumns(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    refinement: jsonb('refinement').$type<RecipeRefinement>(),
    noResults: text('no_results'),
  },
  (t) => [
    uniqueIndex('recipe_refine_request_pending_recipe_key')
      .on(t.recipeId)
      .where(sql`${t.status} = 'pending'`),
    check(
      'recipe_refine_request_status_check',
      oneOf(t.status, contractRequestStatusSchema.options),
    ),
  ],
);
