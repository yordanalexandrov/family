import {
  addDays,
  atHourInSofia,
  type DateKey,
  dateKeyInSofia,
  type InboxDetail,
  type Meal,
  mealTitle,
  startOfDayInSofia,
  weekdayName,
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
import { listPeople, listUsers } from '../db/repositories/users.js';
import type { InboxMessage, InboxService } from './inbox.js';
import type { MenuNotifications } from './menu-notifications.js';
import {
  mealUrl,
  notificationTag,
  pantryUrl,
  recipeUrl,
} from './notification-links.js';
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
  /**
   * The people; each gets every reminder in the inbox, and on the phone only with its kind on (`app.inbox.notify`).
   * The names say who cooks in the details.
   */
  users: { id: string; name: string }[];
  log: NotificationLogEntry[];
}

/** One reminder to send to one person; once sent it goes to `notification_log` with these `kind`, `subjectId` and `onDate`. */
export interface DueReminder extends NotificationLogEntry {
  message: InboxMessage;
}

/** The buttons of a reminder about a dinner on `date` make sense in the inbox until the end of that day. */
function endOfDay(date: DateKey): Date {
  return startOfDayInSofia(addDays(date, 1));
}

/** Whether a reminder for `hour` on `date` is due at `now`: from that hour until {@link REMINDER_GRACE_MS} after it. */
function isDue(now: Date, date: DateKey, hour: number): boolean {
  const late = now.getTime() - atHourInSofia(date, hour);
  return late >= 0 && late <= REMINDER_GRACE_MS;
}

/** The details of „Кой готви довечера“: the dish, with its recipe; none for a dinner with only a note. */
function cookDetails(
  recipeId: string | null,
  title: string | null,
): InboxDetail[] {
  return recipeId && title
    ? [{ text: `Рецепта: ${title}`, url: recipeUrl(recipeId) }]
    : [];
}

/**
 * The thaw reminder of `meal`. Its details: each product „Във фризера“ (to the pantry), the dinner (to its day in the
 * menu) and, if it has one, the cook.
 */
function thawMessage(
  meal: ReminderMeal,
  products: string[],
  title: string,
  cook: string | undefined,
): InboxMessage {
  const details: InboxDetail[] = [
    ...products.map((product) => ({
      text: `Във фризера: ${product}`,
      url: pantryUrl(),
    })),
    {
      text: `Вечеря: ${meal.title}, ${weekdayName(meal.date)}`,
      url: mealUrl(meal),
    },
  ];
  if (cook) {
    details.push({ text: `Готви: ${cook}` });
  }
  return {
    title,
    body: `${meal.title}: ${products.join(', ')}`,
    tag: notificationTag.thaw(meal.id),
    url: mealUrl(meal),
    details,
    actions: [
      {
        action: 'thawed',
        title: 'Извадих',
        post: `/api/menu/meals/${meal.id}/thawed`,
      },
    ],
    actionUntil: endOfDay(meal.date),
  };
}

/**
 * The reminders due at `now` that have not been sent (GLOSSARY: Напомняне). „Извади месото“ for the dinner of day D
 * with a recipe: its products that are „Във фризера“, to everyone, at 20:00 on D−1 and, unless someone
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
        due.push({
          kind: 'thaw',
          subjectId: meal.id,
          onDate,
          userId: user.id,
          message: thawMessage(
            meal,
            products,
            title,
            state.users.find((cook) => cook.id === meal.cookUserId)?.name,
          ),
        });
      }
    }
  }
  return due;
}

/**
 * „Кой готви довечера“ due at `now`, sent or not: at 16:00 on D for the dinner of D with a recipe or a note. With a
 * cook, „Довечера готвиш ти“ to the cook; without, „Кой готви довечера?“ with „Аз“ to everyone. The details give the
 * dish with its recipe.
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
      details: cookDetails(meal.recipeId, meal.title),
    };
    const message: InboxMessage = meal.cookUserId
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
          actionUntil: endOfDay(meal.date),
        };
    for (const user of state.users) {
      if (meal.cookUserId === null || meal.cookUserId === user.id) {
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
   * question, on whichever day, gets the answer in its place, in the inbox and on every device: „Довечера готвиш ти“ for the cook,
   * „Довечера готви <име>“ for the others.
   */
  cookClaimed(meal: Meal, cookUserId: string): Promise<void>;
}

export function createReminders({
  db,
  inbox,
  now,
  log,
  menuNotifications,
}: {
  db: Db;
  inbox: InboxService;
  now: () => Date;
  log: Pick<FastifyBaseLogger, 'info'>;
  menuNotifications: MenuNotifications;
}): Reminders {
  async function sendDue() {
    const at = now();
    const today = dateKeyInSofia(at);
    // Reminders are for people only, never for Рецептурко (ADR-0014).
    const due = dueReminders(at, {
      // Today's dinner for the morning one, tomorrow's for the evening one.
      meals: await listReminderDinners(db, [today, addDays(today, 1)]),
      frozen: await listFrozenIngredientIds(db),
      users: await listPeople(db),
      log: await listNotificationLog(db, ['thaw', 'cook'], [today]),
    });
    for (const { message, ...entry } of due) {
      // Logged first, so a reminder is never sent twice, even by two runs at once; a failed push is not retried.
      if (await claimNotification(db, entry, at)) {
        const { devices } = await inbox.notify(
          entry.userId,
          entry.kind,
          message,
        );
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
        await inbox.notify(asked, 'cook', {
          title:
            asked === cookUserId
              ? 'Довечера готвиш ти'
              : `Довечера готви ${cook?.name ?? ''}`.trim(),
          body: mealTitle(meal) ?? '',
          tag: notificationTag.cook(meal.id),
          url: mealUrl(meal),
          details: cookDetails(meal.recipeId, meal.recipe?.title ?? null),
        });
      }
    },
  };
}
