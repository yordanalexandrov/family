import {
  addDays,
  type DateKey,
  dateKeyInSofia,
  type NotificationKind,
  type NotificationSettings,
  startOfDayInSofia,
  weekStartOf,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import {
  claimNotification,
  listNotificationLog,
} from '../db/repositories/notification-log.js';
import {
  listFrozenIngredientIds,
  listReminderDinners,
  markMealThawed,
} from '../db/repositories/reminders.js';
import { listUsers } from '../db/repositories/users.js';
import { NotFoundError } from './errors.js';
import { NO_SUCH_MEAL } from './menu.js';
import type { MenuNotifications } from './menu-notifications.js';
import type { PushMessage, PushService } from './push.js';

/** „Извади месото“ comes at these hours in Sofia: the evening before the dinner and its morning. Changed by PR. */
export const THAW_EVENING_HOUR = 20;
export const THAW_MORNING_HOUR = 8;
/** A reminder later than this after its hour (the api was down) is skipped. */
export const REMINDER_GRACE_MS = 2 * 3_600_000;

const HOUR_MS = 3_600_000;

/** A dinner of the menu as the reminders see it; `title` and `ingredients` are its recipe's, `null`/empty without one. */
export interface ReminderMeal {
  id: string;
  date: DateKey;
  title: string | null;
  /** The recipe's products, in its order. */
  ingredients: { id: string; name: string }[];
  /** „Извадих“ (GLOSSARY): someone took the meat out. */
  thawedAt: Date | null;
}

/** A reminder sent before, from `notification_log`. */
export interface ReminderLogEntry {
  kind: NotificationKind;
  subjectId: string;
  onDate: DateKey;
  userId: string;
}

/** What {@link dueReminders} decides from. */
export interface ReminderState {
  /** The dinners of today and tomorrow in Sofia (more do no harm). */
  meals: ReminderMeal[];
  /** The ingredient ids of the pantry products „Във фризера“. */
  frozen: string[];
  /** Everyone, with the kinds each has on. */
  users: { id: string; settings: NotificationSettings }[];
  log: ReminderLogEntry[];
}

/** One reminder to send to one person; once sent it goes to `notification_log` with these `kind`, `subjectId` and `onDate`. */
export interface DueReminder extends ReminderLogEntry {
  message: PushMessage;
}

/**
 * The instant `hour`:00 in Sofia on `date`, counted back from the next midnight: the DST jumps there are at 03:00/04:00,
 * so this holds for hours from 04:00 on.
 */
function atHourInSofia(date: DateKey, hour: number): number {
  return startOfDayInSofia(addDays(date, 1)).getTime() - (24 - hour) * HOUR_MS;
}

/** Whether a reminder for `hour` on `date` is due at `now`: from that hour until {@link REMINDER_GRACE_MS} after it. */
function isDue(now: Date, date: DateKey, hour: number): boolean {
  const late = now.getTime() - atHourInSofia(date, hour);
  return late >= 0 && late <= REMINDER_GRACE_MS;
}

/** The thaw reminder of `meal`, sent on `onDate`. */
function thawMessage(
  meal: ReminderMeal,
  products: string[],
  title: string,
): PushMessage {
  return {
    title,
    body: `${meal.title}: ${products.join(', ')}`,
    tag: `thaw-${meal.id}`,
    url: `/menu?week=${weekStartOf(startOfDayInSofia(meal.date))}`,
    actions: [
      {
        action: 'thawed',
        title: 'Извадих',
        post: `/api/menu/meals/${meal.id}/thawed`,
      },
    ],
  };
}

/**
 * The reminders due at `now` that have not been sent (GLOSSARY: Напомняне). „Извади месото“ for the dinner of day D
 * with a recipe: its products that are „Във фризера“, to everyone with `thaw` on, at 20:00 on D−1 and, unless someone
 * answered „Извадих“, at 08:00 on D. Each is sent on its own day, so the two are separate in the log; one later than
 * {@link REMINDER_GRACE_MS} is skipped. The recipe is read now, so a change after the evening one shows in the morning.
 */
export function dueReminders(now: Date, state: ReminderState): DueReminder[] {
  const today = dateKeyInSofia(now);
  const frozen = new Set(state.frozen);
  const sent = new Set(state.log.map(logKey));
  const due: DueReminder[] = [];
  for (const meal of state.meals) {
    const products = meal.ingredients
      .filter((ingredient) => frozen.has(ingredient.id))
      .map((ingredient) => ingredient.name);
    if (meal.title === null || products.length === 0 || meal.thawedAt) {
      continue;
    }
    const occasions = [
      {
        onDate: addDays(meal.date, -1),
        hour: THAW_EVENING_HOUR,
        title: 'Извади месото за утре',
      },
      {
        onDate: meal.date,
        hour: THAW_MORNING_HOUR,
        title: 'Извади месото за довечера',
      },
    ];
    for (const { onDate, hour, title } of occasions) {
      if (onDate !== today || !isDue(now, onDate, hour)) {
        continue;
      }
      for (const user of state.users) {
        const entry: ReminderLogEntry = {
          kind: 'thaw',
          subjectId: meal.id,
          onDate,
          userId: user.id,
        };
        if (user.settings.thaw && !sent.has(logKey(entry))) {
          due.push({ ...entry, message: thawMessage(meal, products, title) });
        }
      }
    }
  }
  return due;
}

function logKey({ kind, subjectId, onDate, userId }: ReminderLogEntry): string {
  return `${kind}|${subjectId}|${onDate}|${userId}`;
}

/** The reminders (GLOSSARY: Напомняне); created once in `buildApp()` as `app.reminders`. */
export interface Reminders {
  /**
   * The cron's `reminders` job (`plugins/scheduler.ts`, every 5 minutes): sends what {@link dueReminders} finds due,
   * logging it in `notification_log`, and the gathered menu activity. Rejects only when the database does.
   */
  run(): Promise<void>;
  /**
   * „Извадих“ for a meal (GLOSSARY), from either person: the morning „Извади месото“ is not sent to anyone. Pressed
   * again, nothing changes; 404 for an unknown meal.
   */
  thawed(mealId: string): Promise<void>;
}

export function createReminders({
  db,
  push,
  now,
  log,
  menuNotifications,
}: {
  db: Db;
  push: PushService;
  now: () => Date;
  log: Pick<FastifyBaseLogger, 'info'>;
  menuNotifications: MenuNotifications;
}): Reminders {
  async function sendThaw() {
    const at = now();
    const today = dateKeyInSofia(at);
    const users = await listUsers(db);
    const due = dueReminders(at, {
      // Today's dinner for the morning one, tomorrow's for the evening one.
      meals: await listReminderDinners(db, [today, addDays(today, 1)]),
      frozen: await listFrozenIngredientIds(db),
      users: await Promise.all(
        users.map(async ({ id }) => ({
          id,
          settings: await push.settings(id),
        })),
      ),
      log: await listNotificationLog(db, 'thaw', [today]),
    });
    for (const { message, ...entry } of due) {
      // Logged first, so a reminder is never sent twice, even by two runs at once; a failed push is not retried.
      if (await claimNotification(db, entry, at)) {
        const devices = await push.send(entry.userId, entry.kind, message);
        log.info({ ...entry, devices }, 'reminder sent');
      }
    }
  }

  return {
    async run() {
      await sendThaw();
      await menuNotifications.sendQuietActivity();
    },

    async thawed(mealId) {
      if (!(await markMealThawed(db, mealId, now()))) {
        throw new NotFoundError(NO_SUCH_MEAL);
      }
    },
  };
}
