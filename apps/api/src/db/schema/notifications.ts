import {
  type InboxDetail,
  type NotificationKind,
  notificationKindSchema,
  type PushAction,
} from '@family/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
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

/**
 * Actions of others on the menu of a week (GLOSSARY: Известие от Съгласуването), gathered for one person until they
 * have been quiet for a while; the cron then sends one notification and deletes the row. In the database, not a timer,
 * so a restart does not lose them.
 */
export const menuActivity = pgTable(
  'menu_activity',
  {
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    votes: integer('votes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    swaps: integer('swaps').notNull().default(0),
    lastAt: timestamp('last_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.weekStart, t.recipientUserId] })],
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
