import type { ContractFailure, ContractRequestStatus } from '@family/shared';
import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './user.js';

/** When the row was written, by the database clock. */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

/**
 * The columns every AI request (GLOSSARY: AI заявка) has, whatever its contract: who asked, the hint, the status and
 * why it failed. Each table spreads them next to its own parameters and adds its `<table>_status_check` against
 * `contractRequestStatusSchema`; `db/repositories/contract-requests.ts` finishes any such table.
 */
export const contractRequestColumns = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  hint: text('hint'),
  status: text('status')
    .$type<ContractRequestStatus>()
    .notNull()
    .default('pending'),
  error: text('error').$type<ContractFailure>(),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});
