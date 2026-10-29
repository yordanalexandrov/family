import {
  contractRequestStatusSchema,
  type MealCommentKind,
  type MealReplaceCandidate,
  type MenuProposalTrigger,
  mealCommentKindSchema,
  menuProposalTriggerSchema,
  type Servings,
  type Slot,
  slotSchema,
  type Vote,
  type VoteValue,
  voteValueSchema,
} from '@family/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { oneOf } from './checks.js';
import { contractRequestColumns, createdAt } from './columns.js';
import { recipe } from './food.js';
import { user } from './user.js';

/** GLOSSARY: Седмично меню. One per week, identified by its Monday (`week_start`); no status. */
export const mealPlan = pgTable('meal_plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekStart: date('week_start', { mode: 'string' }).notNull().unique(),
  summary: text('summary'),
  /** `null` for the plan the cron proposed (`menu_proposal_request.trigger` `schedule`). */
  createdBy: uuid('created_by').references(() => user.id),
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
    /** „Извадих“ (GLOSSARY): when someone took the meat out for it; a new recipe sets it back to `null`. */
    thawedAt: timestamp('thawed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('meal_plan_date_slot_key').on(t.planId, t.date, t.slot),
    index('meal_date_idx').on(t.date),
    check('meal_slot_check', oneOf(t.slot, slotSchema.options)),
  ],
);

/**
 * GLOSSARY: Глас. At most one per meal and user, for the meal's current recipe and note; it goes with the meal (and so
 * with the plan).
 */
export const mealVote = pgTable(
  'meal_vote',
  {
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meal.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    value: text('value').$type<VoteValue>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.mealId, t.userId] }),
    check('meal_vote_value_check', oneOf(t.value, voteValueSchema.options)),
  ],
);

/**
 * GLOSSARY: Разговор. The lines of a meal's thread, read by `(meal_id, created_at, seq)`; they go with the meal and stay
 * when its recipe or note changes. A `system` line records a change by `author_user_id` and is never deleted.
 */
export const mealComment = pgTable(
  'meal_comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meal.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<MealCommentKind>().notNull(),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => user.id),
    body: text('body').notNull(),
    createdAt: createdAt(),
    /** Write order: breaks the tie of two lines with the same `created_at` (a change and its system line). */
    seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  },
  (t) => [
    index('meal_comment_meal_created_idx').on(t.mealId, t.createdAt),
    check(
      'meal_comment_kind_check',
      oneOf(t.kind, mealCommentKindSchema.options),
    ),
  ],
);

/**
 * The last „Махни ястието от деня“ of a meal, kept for its „Върни“: the recipe, its `why` and the votes it took, and
 * the system line it wrote (`comment_id`). Only `removed_by` may bring it back; a new recipe for the day drops it.
 */
export const mealRemoval = pgTable('meal_removal', {
  mealId: uuid('meal_id')
    .primaryKey()
    .references(() => meal.id, { onDelete: 'cascade' }),
  removedBy: uuid('removed_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  recipeId: uuid('recipe_id')
    .notNull()
    .references(() => recipe.id, { onDelete: 'cascade' }),
  why: text('why'),
  votes: jsonb('votes').$type<Vote[]>().notNull(),
  commentId: uuid('comment_id').references(() => mealComment.id, {
    onDelete: 'set null',
  }),
  removedAt: timestamp('removed_at', { withTimezone: true }).notNull(),
});

/**
 * GLOSSARY: Предложение за меню. One run of `menu.propose` for a week; `plan_id` is set when it is `done`.
 * At most one `pending` per week.
 */
export const menuProposalRequest = pgTable(
  'menu_proposal_request',
  {
    ...contractRequestColumns(),
    // The cron (`trigger` `schedule`) has no user; a user's proposal always names one.
    requestedBy: uuid('requested_by').references(() => user.id),
    trigger: text('trigger')
      .$type<MenuProposalTrigger>()
      .notNull()
      .default('user'),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    planId: uuid('plan_id').references(() => mealPlan.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('menu_proposal_request_pending_week_key')
      .on(t.weekStart)
      .where(sql`${t.status} = 'pending'`),
    check(
      'menu_proposal_request_status_check',
      oneOf(t.status, contractRequestStatusSchema.options),
    ),
    check(
      'menu_proposal_request_trigger_check',
      oneOf(t.trigger, menuProposalTriggerSchema.options),
    ),
    check(
      'menu_proposal_request_requested_by_check',
      sql`${t.trigger} <> 'user' or ${t.requestedBy} is not null`,
    ),
  ],
);

/**
 * One run of `meal.replace` for a meal („✨ Предложи друго“, GLOSSARY: AI заявка); `candidates` (recipe, why, title,
 * time) are written when it is `done`. It goes with the meal; at most one `pending` per meal.
 */
export const mealReplaceRequest = pgTable(
  'meal_replace_request',
  {
    ...contractRequestColumns(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meal.id, { onDelete: 'cascade' }),
    candidates: jsonb('candidates').$type<MealReplaceCandidate[]>(),
  },
  (t) => [
    uniqueIndex('meal_replace_request_pending_meal_key')
      .on(t.mealId)
      .where(sql`${t.status} = 'pending'`),
    check(
      'meal_replace_request_status_check',
      oneOf(t.status, contractRequestStatusSchema.options),
    ),
  ],
);
