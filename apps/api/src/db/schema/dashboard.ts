import type { CalendarColorToken } from '@family/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './user.js';

// Enumerations are `text` with a `check` constraint, not Postgres enums: adding a value is a plain migration.

/**
 * GLOSSARY: Източник на календар. Loaded from GOOGLE_CALENDARS at start (upsert by `google_calendar_id`);
 * a calendar dropped from the env is disabled, not deleted. `color_token` names a design token.
 */
export const calendarSource = pgTable(
  'calendar_source',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    googleCalendarId: text('google_calendar_id').notNull().unique(),
    name: text('name').notNull(),
    ownerUserId: uuid('owner_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    colorToken: text('color_token').$type<CalendarColorToken>().notNull(),
    kind: text('kind', { enum: ['person', 'family'] }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'calendar_source_kind_check',
      sql`${table.kind} in ('person', 'family')`,
    ),
  ],
);

/**
 * GLOSSARY: Събитие. The raw cache: one row per event per source, replaced on every sync of the window.
 * Deduplication (by `ical_uid` + `original_start`) happens when reading.
 */
export const calendarEvent = pgTable(
  'calendar_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarSourceId: uuid('calendar_source_id')
      .notNull()
      .references(() => calendarSource.id, { onDelete: 'cascade' }),
    /** Google's event id, unique within its calendar. */
    externalId: text('external_id').notNull(),
    icalUid: text('ical_uid'),
    /** For an instance of a recurring series: its originally scheduled start. */
    originalStart: timestamp('original_start', { withTimezone: true }),
    title: text('title').notNull(),
    start: timestamp('start', { withTimezone: true }).notNull(),
    end: timestamp('end', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull(),
    location: text('location'),
    htmlLink: text('html_link'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('calendar_event_source_external_id_unique').on(
      table.calendarSourceId,
      table.externalId,
    ),
    index('calendar_event_start_idx').on(table.start),
    index('calendar_event_ical_uid_idx').on(table.icalUid),
  ],
);

/** GLOSSARY: Бюджетна снимка. One row per successful Wallet sync; the newest is the current one. */
export const budgetSnapshot = pgTable(
  'budget_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletBudgetId: text('wallet_budget_id').notNull(),
    name: text('name').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    limitAmount: numeric('limit_amount', {
      precision: 12,
      scale: 2,
      mode: 'number',
    }).notNull(),
    spent: numeric('spent', {
      precision: 12,
      scale: 2,
      mode: 'number',
    }).notNull(),
    remaining: numeric('remaining', {
      precision: 12,
      scale: 2,
      mode: 'number',
    }).notNull(),
    currency: text('currency').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('budget_snapshot_synced_at_idx').on(table.syncedAt.desc())],
);

/** GLOSSARY: Синхронизация. One pull from Google Calendar or Wallet; `running` until it finishes. */
export const syncRun = pgTable(
  'sync_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source', { enum: ['calendar', 'budget'] }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status', { enum: ['running', 'ok', 'failed'] }).notNull(),
    error: text('error'),
  },
  (table) => [
    check(
      'sync_run_source_check',
      sql`${table.source} in ('calendar', 'budget')`,
    ),
    check(
      'sync_run_status_check',
      sql`${table.status} in ('running', 'ok', 'failed')`,
    ),
    index('sync_run_source_started_at_idx').on(
      table.source,
      table.startedAt.desc(),
    ),
  ],
);
