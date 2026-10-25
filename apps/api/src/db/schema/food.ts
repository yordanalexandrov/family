import {
  type Aisle,
  aisleSchema,
  type BaseUnit,
  baseUnitSchema,
  type Nutrition,
  type RecipeSuggestionStatus,
  recipeSuggestionStatusSchema,
  type Slot,
  type Suggestion,
  type SuggestionRequestStatus,
  slotSchema,
  suggestionRequestStatusSchema,
  type Tag,
  tagSchema,
  type Unit,
  unitSchema,
} from '@family/shared';
import { type SQL, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './user.js';

// Enums are `text` with a `check` against the values in @family/shared, not Postgres enums,
// so adding a value is a plain constraint swap in a migration. `$type` gives the columns the shared types.

/** `'a', 'b', …` for `in (…)` and `array[…]`; values are fixed identifiers from shared, never user input. */
function literals(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${literals(values)})`;
}

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

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

/** A recipe in the registry (GLOSSARY: Рецепта); `steps` is a JSON array of strings. */
export const recipe = pgTable(
  'recipe',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    servings: integer('servings').notNull(),
    steps: jsonb('steps').$type<string[]>().notNull(),
    sourceUrl: text('source_url'),
    prepMinutes: integer('prep_minutes'),
    tags: text('tags').array().$type<Tag[]>().notNull().default(sql`'{}'`),
    nutritionPer100g: jsonb('nutrition_per_100g').$type<Nutrition>(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('recipe_archived_at_idx').on(t.archivedAt),
    check('recipe_servings_check', sql`${t.servings} >= 1`),
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
    id: uuid('id').primaryKey().defaultRandom(),
    slot: text('slot').$type<Slot>().notNull(),
    maxMinutes: integer('max_minutes'),
    tags: text('tags').array().$type<Tag[]>().notNull().default(sql`'{}'`),
    hint: text('hint'),
    status: text('status')
      .$type<SuggestionRequestStatus>()
      .notNull()
      .default('pending'),
    error: text('error'),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'recipe_suggestion_request_slot_check',
      oneOf(t.slot, slotSchema.options),
    ),
    check(
      'recipe_suggestion_request_status_check',
      oneOf(t.status, suggestionRequestStatusSchema.options),
    ),
    check(
      'recipe_suggestion_request_tags_check',
      sql`${t.tags} <@ array[${literals(tagSchema.options)}]::text[]`,
    ),
  ],
);

/** One suggested recipe (GLOSSARY: Предложение за рецепта); `payload` is a `Suggestion` of the contract. */
export const recipeSuggestion = pgTable(
  'recipe_suggestion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => recipeSuggestionRequest.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    payload: jsonb('payload').$type<Suggestion>().notNull(),
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
    check(
      'recipe_suggestion_status_check',
      oneOf(t.status, recipeSuggestionStatusSchema.options),
    ),
  ],
);
