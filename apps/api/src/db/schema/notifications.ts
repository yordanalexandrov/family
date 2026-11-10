import {
  type InboxDetail,
  type NotificationKind,
  notificationKindSchema,
  type PushAction,
} from '@family/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
import { createdAt } from './columns.js';
import { user } from './user.js';

/**
 * A device where a person turned notifications on (GLOSSARY: Известие), as `PushSubscription.toJSON()` gave it. The
 * `endpoint` is the device: subscribing it again, for whoever is picked on it now, moves the row to that person. A 404
 * or 410 from the push service deletes the row; `last_success_at` is the last message the service took.
 */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  },
  (t) => [index('push_subscription_user_id_idx').on(t.userId)],
);

/** A notification kind a person set; no row means on. It applies to all of the person's devices. */
export const notificationSetting = pgTable(
  'notification_setting',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NotificationKind>().notNull(),
    enabled: boolean('enabled').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind] }),
    check(
      'notification_setting_kind_check',
      oneOf(t.kind, notificationKindSchema.options),
    ),
  ],
);

/**
 * Each reminder sent, once per subject, day and person, so the cron never sends it twice. `subject_id` is the meal,
 * or the week for `menu`.
 */
export const notificationLog = pgTable(
  'notification_log',
  {
    kind: text('kind').$type<NotificationKind>().notNull(),
    subjectId: text('subject_id').notNull(),
    onDate: date('on_date', { mode: 'string' }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.subjectId, t.onDate, t.userId] }),
    check(
      'notification_log_kind_check',
      oneOf(t.kind, notificationKindSchema.options),
    ),
  ],
);

/** What a person did on the menu of a week, as the others are told: a vote, a comment or a changed meal. */
export const MENU_ACTIVITY_KINDS = ['votes', 'comments', 'swaps'] as const;

export type MenuActivityKind = (typeof MENU_ACTIVITY_KINDS)[number];

/**
 * Actions of others on the menu of a week (GLOSSARY: Известие от Съгласуването), one row per action and per person
 * told, gathered until the week has been quiet for that person for a while; the cron then sends one notification and
 * deletes the rows. In the database, not a timer, so a restart does not lose them. `date` and `meal_id` are the day
 * and the meal the action was on, at the time of the action; `text` is what the person did, without their name
 * („гласува за „Мусака““). No foreign key to the meal: a deleted plan does not take back what was done.
 */
export const menuActivity = pgTable(
  'menu_activity',
  {
    /** Write order: the order of the actions of one day, also for two with the same `at`. */
    seq: bigint('seq', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<MenuActivityKind>().notNull(),
    mealId: uuid('meal_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    text: text('text').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('menu_activity_recipient_week_idx').on(
      t.recipientUserId,
      t.weekStart,
    ),
    check('menu_activity_kind_check', oneOf(t.kind, MENU_ACTIVITY_KINDS)),
  ],
);

/**
 * A person's notification in the inbox (GLOSSARY: Входяща кутия), the source of every notification; push only rings
 * the phone (ADR-0015). One per person and `tag`: the same tag updates the row, `updated_at = now` and unread again
 * (`read_at` null). The cron deletes rows not updated for 30 days. Apart from `notification_log`, which only keeps the
 * cron from sending a reminder twice. `details` are the lines under „Още“, only in the inbox (`[]` when there are none).
 */
export const inboxItem = pgTable(
  'inbox_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NotificationKind>().notNull(),
    tag: text('tag').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url').notNull(),
    details: jsonb('details')
      .$type<InboxDetail[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * The buttons of the question („Извадих“, „Аз“), as in its push. An answer with the same tag and no buttons
     * („Довечера готви Дани“) keeps them, so the inbox can say who answered.
     */
    actions: jsonb('actions').$type<PushAction[]>(),
    /** Until when the buttons make sense: the end of the dinner's day. */
    actionUntil: timestamp('action_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('inbox_item_user_id_tag_idx').on(t.userId, t.tag),
    index('inbox_item_user_id_updated_at_idx').on(t.userId, t.updatedAt),
    check(
      'inbox_item_kind_check',
      oneOf(t.kind, notificationKindSchema.options),
    ),
  ],
);
