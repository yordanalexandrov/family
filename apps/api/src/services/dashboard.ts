import {
  addDays,
  type DashboardResponse,
  type DashboardThaw,
  dateKeyInSofia,
} from '@family/shared';
import type { Db } from '../db/client.js';
import { latestSnapshot } from '../db/repositories/budget-snapshots.js';
import {
  listFrozenIngredientIds,
  listReminderDinners,
} from '../db/repositories/reminders.js';
import { readCalendarEvents } from './calendar-events.js';
import { readCooking } from './menu.js';
import { type ConfiguredSources, readSyncStatuses } from './sync-status.js';
import { thawCandidates, thawDates } from './thaw.js';

/** The dashboard shows today and the next three days. */
const DASHBOARD_DAYS = 4;

/** `GET /api/dashboard`: the cached events, the current budget snapshot, today's dinner and how fresh each source is. */
export async function readDashboard(
  db: Db,
  now: Date,
  configured: ConfiguredSources,
): Promise<DashboardResponse> {
  const today = dateKeyInSofia(now);
  const [events, budget, cooking, thaw, sync] = await Promise.all([
    readCalendarEvents(db, today, addDays(today, DASHBOARD_DAYS)),
    latestSnapshot(db),
    readCooking(db, today),
    readThaw(db, now),
    readSyncStatuses(db, configured, now),
  ]);
  return {
    today,
    now: now.toISOString(),
    days: events.days,
    budget,
    cooking,
    thaw,
    sync,
  };
}

/** „Извади месото“ as the reminders find it ({@link thawCandidates}), with when someone answered „Извадих“. */
async function readThaw(db: Db, now: Date): Promise<DashboardThaw[]> {
  const [meals, frozen] = await Promise.all([
    listReminderDinners(db, thawDates(now)),
    listFrozenIngredientIds(db),
  ]);
  return thawCandidates(meals, frozen, now).map(({ meal, products }) => ({
    mealId: meal.id,
    date: meal.date,
    products,
    thawedAt: meal.thawedAt?.toISOString() ?? null,
  }));
}
