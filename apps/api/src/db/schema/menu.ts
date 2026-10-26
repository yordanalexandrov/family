import {
  type MenuProposalStatus,
  menuProposalStatusSchema,
  type Servings,
  type Slot,
  type SuggestionFailure,
  slotSchema,
} from '@family/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { oneOf } from './checks.js';
import { createdAt } from './columns.js';
import { recipe } from './food.js';
import { user } from './user.js';

/** GLOSSARY: Седмично меню. One per week, identified by its Monday (`week_start`); no status. */
export const mealPlan = pgTable('meal_plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekStart: date('week_start', { mode: 'string' }).notNull().unique(),
  summary: text('summary'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * GLOSSARY: Ястие. One day and slot of a plan: a recipe, a note, both or neither; `servings` is
 * `{ [userId]: count }`. A recipe in a plan is archived, never deleted (`restrict`).
 */
export const meal = pgTable(
  'meal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => mealPlan.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    slot: text('slot').$type<Slot>().notNull(),
    recipeId: uuid('recipe_id').references(() => recipe.id, {
      onDelete: 'restrict',
    }),
    note: text('note'),
    cookUserId: uuid('cook_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    servings: jsonb('servings').$type<Servings>().notNull(),
    why: text('why'),
  },
  (t) => [
    uniqueIndex('meal_plan_date_slot_key').on(t.planId, t.date, t.slot),
    index('meal_date_idx').on(t.date),
    check('meal_slot_check', oneOf(t.slot, slotSchema.options)),
  ],
);

/**
 * GLOSSARY: Предложение за меню. One run of `menu.propose` for a week; `plan_id` is set when it is `done`.
 * At most one `pending` per week.
 */
export const menuProposalRequest = pgTable(
  'menu_proposal_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    hint: text('hint'),
    status: text('status')
      .$type<MenuProposalStatus>()
      .notNull()
      .default('pending'),
    error: text('error').$type<SuggestionFailure>(),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => user.id),
    planId: uuid('plan_id').references(() => mealPlan.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('menu_proposal_request_pending_week_key')
      .on(t.weekStart)
      .where(sql`${t.status} = 'pending'`),
    check(
      'menu_proposal_request_status_check',
      oneOf(t.status, menuProposalStatusSchema.options),
    ),
  ],
);
