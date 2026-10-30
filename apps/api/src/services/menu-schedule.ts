import {
  addDays,
  type ContractRequestStatus,
  type DateKey,
  HOUR_MS,
  type MenuProposalRequest,
  type MenuProposalTrigger,
  startOfDayInSofia,
  weekStartOf,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import {
  findPlanByWeek,
  listProposalsOfWeek,
} from '../db/repositories/menu.js';
import { ConflictError } from './errors.js';
import type { MenuProposals } from './menu.js';

/** The cron proposes next week's menu from Wednesday at this hour in Sofia on; changed by PR, not configuration. */
export const SCHEDULED_PROPOSAL_WEEKDAY = 2;
export const SCHEDULED_PROPOSAL_HOUR = 9;

/** What the cron needs to know of the week after `now`'s ({@link scheduledWeekOf}). */
export interface ScheduleState {
  hasPlan: boolean;
  /** Every proposal for that week, whatever its status. */
  requests: { trigger: MenuProposalTrigger; status: ContractRequestStatus }[];
}

/** The week the cron proposes for at `now`: the next one. */
export function scheduledWeekOf(now: Date): DateKey {
  return addDays(weekStartOf(now), 7);
}

/**
 * The week the cron should propose a menu for at `now`, or `null`: due from Wednesday 09:00 in Sofia of the current
 * week, while the next week has no plan, no pending proposal and no proposal of the cron (so a failed one is not retried;
 * a cron proposal for the next week can only have been made this week).
 */
export function scheduledProposalDue(
  now: Date,
  state: ScheduleState,
): DateKey | null {
  const week = scheduledWeekOf(now);
  // DST jumps in Sofia happen on Sundays at 03:00/04:00, never between Wednesday 00:00 and 09:00.
  const dueAt =
    startOfDayInSofia(addDays(week, SCHEDULED_PROPOSAL_WEEKDAY - 7)).getTime() +
    SCHEDULED_PROPOSAL_HOUR * HOUR_MS;
  if (now.getTime() < dueAt || state.hasPlan) {
    return null;
  }
  const taken = state.requests.some(
    ({ trigger, status }) => status === 'pending' || trigger === 'schedule',
  );
  return taken ? null : week;
}

/** The cron's `menu.propose` (`plugins/scheduler.ts`); created in `buildApp()` as `app.menuSchedule` when OpenClaw is configured. */
export interface MenuSchedule {
  /**
   * Proposes next week's menu without a hint when {@link scheduledProposalDue}; the proposal is a `pending` AI request
   * with trigger `schedule` and no user, which ends like a user's. Answers it, or `null` when nothing was due.
   */
  run(): Promise<MenuProposalRequest | null>;
}

export function createMenuSchedule({
  db,
  proposals,
  now,
  log,
}: {
  db: Db;
  proposals: MenuProposals;
  now: () => Date;
  log: Pick<FastifyBaseLogger, 'info'>;
}): MenuSchedule {
  return {
    async run() {
      const at = now();
      const weekStart = scheduledWeekOf(at);
      const due = scheduledProposalDue(at, {
        hasPlan: (await findPlanByWeek(db, weekStart)) !== undefined,
        requests: await listProposalsOfWeek(db, weekStart),
      });
      if (due === null) {
        return null;
      }
      try {
        return await proposals.request({ weekStart: due }, null);
      } catch (error) {
        // A plan or proposal made meanwhile, or too few dinner recipes: nothing stored, the users propose by hand.
        if (error instanceof ConflictError) {
          log.info(
            { weekStart: due, reason: error.message },
            'menu not proposed',
          );
          return null;
        }
        throw error;
      }
    },
  };
}
