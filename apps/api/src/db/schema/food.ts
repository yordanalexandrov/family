import {
  type Aisle,
  aisleSchema,
  type BaseUnit,
  baseUnitSchema,
  type CookingChange,
  contractRequestStatusSchema,
  type ImportPayload,
  type Nutrition,
  type Preparation,
  type PrepTimeRange,
  prepTimeRangeSchema,
  type RecipeImportSource,
  type RecipeRefinement,
  type RecipeRevision,
  type RecipeStep,
  type RecipeSuggestionStatus,
  type RevisableRecipe,
  type RevisionDecision,
  recipeImportSourceSchema,
  recipeSuggestionStatusSchema,
  revisionDecisionSchema,
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
  type AnyPgColumn,
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

/**
 * GLOSSARY: Поправка на рецепта. One run of `recipe.revise` for a recipe of the registry or a suggestion waiting for
 * approval, exactly one of `recipe_id` and `suggestion_id`: the instruction, when the recipe was saved as it was sent
 * (`base_updated_at`) or the review form's recipe the run reads (`base_recipe`, for a suggestion), the revised recipe
 * once it is `done` or the agent's reason in `no_results`, and what the person decided. The kiosk has no acting user, so
 * `requested_by` and `decided_by` may be `null`. The recipe changes only when the person saves it with the revision.
 */
export const recipeRevisionRequest = pgTable(
  'recipe_revision_request',
  {
    ...contractRequestColumns(),
    // The kiosk asks without an acting user.
    requestedBy: uuid('requested_by').references(() => user.id),
    recipeId: uuid('recipe_id').references(() => recipe.id, {
      onDelete: 'cascade',
    }),
    suggestionId: uuid('suggestion_id').references(() => recipeSuggestion.id, {
      onDelete: 'cascade',
    }),
    instruction: text('instruction').notNull(),
    baseUpdatedAt: timestamp('base_updated_at', { withTimezone: true }),
    baseRecipe: jsonb('base_recipe').$type<RevisableRecipe>(),
    revision: jsonb('revision').$type<RecipeRevision>(),
    noResults: text('no_results'),
    decision: text('decision').$type<RevisionDecision>(),
    decidedBy: uuid('decided_by').references(() => user.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    index('recipe_revision_request_recipe_idx').on(t.recipeId),
    index('recipe_revision_request_suggestion_idx').on(t.suggestionId),
    check(
      'recipe_revision_request_target_check',
      sql`num_nonnulls(${t.recipeId}, ${t.suggestionId}) = 1`,
    ),
    check(
      'recipe_revision_request_status_check',
      oneOf(t.status, contractRequestStatusSchema.options),
    ),
    check(
      'recipe_revision_request_decision_check',
      oneOf(t.decision, revisionDecisionSchema.options),
    ),
  ],
);

/**
 * GLOSSARY: Въпрос в Готвене. One run of `cooking.ask` for a recipe: the question, the step (index from 0) and the
 * servings it was asked at, and `answer` once it is `done`. The kiosk has no acting user, so `requested_by` may be
 * `null`. The recipe itself is never changed by it. A follow-up `follows` an earlier question of the same recipe;
 * `chain_id` is the id of the first question of its chain (its own for the first), with at most one `pending` per
 * chain.
 */
export const cookingQuestionRequest = pgTable(
  'cooking_question_request',
  {
    ...contractRequestColumns(),
    // The kiosk asks without an acting user.
    requestedBy: uuid('requested_by').references(() => user.id),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    step: integer('step').notNull(),
    servings: integer('servings').notNull(),
    answer: text('answer'),
    followsId: uuid('follows_id').references(
      (): AnyPgColumn => cookingQuestionRequest.id,
      { onDelete: 'set null' },
    ),
    chainId: uuid('chain_id').notNull(),
    // The cooking change of the answer, for `servings`; `null` for an answer without one.
    change: jsonb('change').$type<CookingChange>(),
    // The questions whose changes were applied on the screen when this one was asked, in their order.
    appliedIds: uuid('applied_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
  },
  (t) => [
    index('cooking_question_request_recipe_idx').on(t.recipeId),
    uniqueIndex('cooking_question_request_pending_chain_key')
      .on(t.chainId)
      .where(sql`${t.status} = 'pending'`),
    check(
      'cooking_question_request_status_check',
      oneOf(t.status, contractRequestStatusSchema.options),
    ),
  ],
);
