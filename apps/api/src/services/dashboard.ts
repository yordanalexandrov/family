import {
  addDays,
  type DashboardResponse,
  dateKeyInSofia,
} from '@family/shared';
import type { Db } from '../db/client.js';
import { latestSnapshot } from '../db/repositories/budget-snapshots.js';
import { readCalendarEvents } from './calendar-events.js';
import { type ConfiguredSources, readSyncStatuses } from './sync-status.js';

/** The dashboard shows today and the next three days. */
const DASHBOARD_DAYS = 4;

/** `GET /api/dashboard`: the cached events, the current budget snapshot and how fresh each source is. */
export async function readDashboard(
  db: Db,
  now: Date,
  configured: ConfiguredSources,
): Promise<DashboardResponse> {
  const today = dateKeyInSofia(now);
  const [events, budget, sync] = await Promise.all([
    readCalendarEvents(db, today, addDays(today, DASHBOARD_DAYS)),
    latestSnapshot(db),
    readSyncStatuses(db, configured, now),
  ]);
  return {
    today,
    now: now.toISOString(),
    days: events.days,
    budget,
    // TODO(епик Седмично меню): what is cooked today comes from the week's menu.
    cooking: { lunch: null, dinner: null },
    sync,
  };
}
