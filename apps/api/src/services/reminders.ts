import {
  addDays,
  type DateKey,
  dateKeyInSofia,
  mealTitle,
  type NotificationKind,
  type NotificationSettings,
  startOfDayInSofia,
  weekStartOf,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import {
  findMeal,
  findPlanSummary,
  updateMeal,
} from '../db/repositories/menu.js';
import {
  claimNotification,
  listNotificationLog,
} from '../db/repositories/notification-log.js';
import {
  claimMealCook,
  listFrozenIngredientIds,
  listReminderDinners,
  markMealThawed,
} from '../db/repositories/reminders.js';
import { listUsers } from '../db/repositories/users.js';
import { ConflictError, NotFoundError } from './errors.js';
import { type EventBus, menuAndShoppingChanged } from './events.js';
import { NO_SUCH_MEAL } from './menu.js';
import type { MenuNotifications } from './menu-notifications.js';
import type { PushMessage, PushService } from './push.js';

/** „Извади месото“ comes at these hours in Sofia: the evening before the dinner and its morning. Changed by PR. */
export const THAW_EVENING_HOUR = 20;
export const THAW_MORNING_HOUR = 8;
/** „Кой готви довечера“ comes at this hour in Sofia on the day of the dinner. Changed by PR. */
export const COOK_HOUR = 16;
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
  note: string | null;
  cookUserId: string | null;
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
    url: menuUrl(meal.date),
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
  const sent = new Set(state.log.map(logKey));
  const unsent = (reminder: DueReminder) => !sent.has(logKey(reminder));
  return [...dueThaw(now, state), ...dueCook(now, state)].filter(unsent);
}

/** „Извади месото“ due at `now`, sent or not. */
function dueThaw(now: Date, state: ReminderState): DueReminder[] {
  const today = dateKeyInSofia(now);
  const frozen = new Set(state.frozen);
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
        if (user.settings.thaw) {
          due.push({ ...entry, message: thawMessage(meal, products, title) });
        }
      }
    }
  }
  return due;
}

/**
 * „Кой готви довечера“ due at `now`, sent or not: at 16:00 on D for the dinner of D with a recipe or a note. With a
 * cook, „Довечера готвиш ти“ to the cook; without, „Кой готви довечера?“ with „Аз“ to everyone. Each only with `cook` on.
 */
function dueCook(now: Date, state: ReminderState): DueReminder[] {
  const today = dateKeyInSofia(now);
  if (!isDue(now, today, COOK_HOUR)) {
    return [];
  }
  const due: DueReminder[] = [];
  for (const meal of state.meals) {
    const title = meal.title ?? meal.note;
    if (meal.date !== today || !title) {
      continue;
    }
    const base = {
      body: title,
      tag: `cook-${meal.id}`,
      url: menuUrl(meal.date),
    };
    const message: PushMessage = meal.cookUserId
      ? { ...base, title: 'Довечера готвиш ти' }
      : {
          ...base,
          title: 'Кой готви довечера?',
          actions: [
            {
              action: 'cook-claim',
              title: 'Аз',
              post: `/api/menu/meals/${meal.id}/cook-claim`,
            },
          ],
        };
    for (const user of state.users) {
      if (
        user.settings.cook &&
        (meal.cookUserId === null || meal.cookUserId === user.id)
      ) {
        due.push({
          kind: 'cook',
          subjectId: meal.id,
          onDate: today,
          userId: user.id,
          message,
        });
      }
    }
  }
  return due;
}

/** The menu at the week of `date`: the web has no parameter for a day. */
function menuUrl(date: DateKey): string {
  return `/menu?week=${weekStartOf(startOfDayInSofia(date))}`;
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
  /**
   * „Аз“ on „Кой готви довечера“ from `userId`: the first to answer becomes the cook of the meal, as when the cook is
   * picked in the menu (`menu.changed`), and whoever else got the question gets „Довечера готви <име>“ in its place.
   * 409 `cook_taken` with `cookUserId` once the meal has a cook; 404 for an unknown meal.
   */
  claimCook(mealId: string, userId: string): Promise<void>;
}

/** The 409 of „Аз“ when someone else answered first or the cook was picked in the menu. */
export const COOK_TAKEN = 'Някой вече готви';

export function createReminders({
  db,
  push,
  now,
  log,
  events,
  menuNotifications,
}: {
  db: Db;
  push: PushService;
  now: () => Date;
  log: Pick<FastifyBaseLogger, 'info'>;
  events: EventBus;
  menuNotifications: MenuNotifications;
}): Reminders {
  async function sendDue() {
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
      log: await listNotificationLog(db, ['thaw', 'cook'], [today]),
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
      await sendDue();
      await menuNotifications.sendQuietActivity();
    },

    async thawed(mealId) {
      if (!(await markMealThawed(db, mealId, now()))) {
        throw new NotFoundError(NO_SUCH_MEAL);
      }
    },

    async claimCook(mealId, userId) {
      const at = now();
      const { meal, weekStart } = await db.transaction(async (tx) => {
        const claimed = await claimMealCook(tx, mealId, userId);
        const current = await findMeal(tx, mealId);
        if (!current) {
          throw new NotFoundError(NO_SUCH_MEAL);
        }
        if (!claimed) {
          throw new ConflictError(COOK_TAKEN, {
            code: 'cook_taken',
            cookUserId: current.cookUserId,
          });
        }
        // As a cook picked in the menu: the plan changed now.
        await updateMeal(tx, mealId, claimed.planId, {}, at);
        const plan = await findPlanSummary(tx, claimed.planId);
        if (!plan) {
          throw new Error('plan of a meal vanished');
        }
        return { meal: current, weekStart: plan.weekStart };
      });
      for (const event of menuAndShoppingChanged(weekStart)) {
        events.publish(event);
      }
      const cook = (await listUsers(db)).find((user) => user.id === userId);
      const asked = (
        await listNotificationLog(db, ['cook'], [meal.date])
      ).filter(
        (entry) => entry.subjectId === mealId && entry.userId !== userId,
      );
      for (const { userId: other } of asked) {
        // Same tag: it takes the place of the question on the other's phone.
        await push.send(other, 'cook', {
          title: `Довечера готви ${cook?.name ?? ''}`.trim(),
          body: mealTitle(meal) ?? '',
          tag: `cook-${mealId}`,
          url: menuUrl(meal.date),
        });
      }
    },
  };
}
