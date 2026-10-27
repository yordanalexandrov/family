import { type NotificationKind, notificationKindSchema } from '@family/shared';
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
