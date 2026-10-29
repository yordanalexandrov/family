import {
  addDays,
  atHourInSofia,
  type DateKey,
  dateKeyInSofia,
  type Meal,
  mealTitle,
  type NotificationSettings,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import {
  claimNotification,
  listNotificationLog,
  listNotifiedUsers,
  type NotificationLogEntry,
} from '../db/repositories/notification-log.js';
import {
  listFrozenIngredientIds,
  listReminderDinners,
  type ReminderMeal,
} from '../db/repositories/reminders.js';
import { listUsers } from '../db/repositories/users.js';
import type { MenuNotifications } from './menu-notifications.js';
import { mealUrl, notificationTag } from './notification-links.js';
import type { PushMessage, PushService } from './push.js';
import {
  THAW_EVENING_HOUR,
  THAW_MORNING_HOUR,
  thawCandidates,
} from './thaw.js';

/** „Кой готви довечера“ comes at this hour in Sofia on the day of the dinner. Changed by PR. */
export const COOK_HOUR = 16;
/** A reminder later than this after its hour (the api was down) is skipped. */
export const REMINDER_GRACE_MS = 2 * 3_600_000;

/** What {@link dueReminders} decides from. */
export interface ReminderState {
  /** The dinners of today and tomorrow in Sofia (more do no harm). */
  meals: ReminderMeal[];
  /** The ingredient ids of the pantry products „Във фризера“. */
  frozen: string[];
  /** Everyone, with the kinds each has on. */
  users: { id: string; settings: NotificationSettings }[];
  log: NotificationLogEntry[];
}

/** One reminder to send to one person; once sent it goes to `notification_log` with these `kind`, `subjectId` and `onDate`. */
export interface DueReminder extends NotificationLogEntry {
  message: PushMessage;
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
    tag: notificationTag.thaw(meal.id),
    url: mealUrl(meal),
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
  const due: DueReminder[] = [];
  for (const { meal, products } of thawCandidates(
    state.meals,
    state.frozen,
    now,
  )) {
    if (meal.thawedAt) {
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
        const entry: NotificationLogEntry = {
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
      tag: notificationTag.cook(meal.id),
      url: mealUrl(meal),
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

function logKey({
  kind,
  subjectId,
  onDate,
  userId,
}: NotificationLogEntry): string {
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
   * After „Аз“ on „Кой готви довечера“ made `cookUserId` the cook of `meal` (`app.menu.claimCook`): whoever got the
   * question, on whichever day, gets the answer in its place on every device: „Довечера готвиш ти“ for the cook,
   * „Довечера готви <име>“ for the others.
   */
  cookClaimed(meal: Meal, cookUserId: string): Promise<void>;
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

    async cookClaimed(meal, cookUserId) {
      const cook = (await listUsers(db)).find((user) => user.id === cookUserId);
      // Same tag: it takes the place of the question on every device that got it, the cook's other ones too.
      for (const asked of await listNotifiedUsers(db, 'cook', meal.id)) {
        await push.send(asked, 'cook', {
          title:
            asked === cookUserId
              ? 'Довечера готвиш ти'
              : `Довечера готви ${cook?.name ?? ''}`.trim(),
          body: mealTitle(meal) ?? '',
          tag: notificationTag.cook(meal.id),
          url: mealUrl(meal),
        });
      }
    },
  };
}
