import {
  addDays,
  type DateKey,
  type InboxDetail,
  type MenuProposalRequest,
  type MenuReworkRequest,
  weekdayName,
  withHint,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import {
  type MenuActivityAction,
  takeQuietMenuActivity,
} from '../db/repositories/menu-activity.js';
import { findRework } from '../db/repositories/menu-reworks.js';
import { listPeople, listUsers } from '../db/repositories/users.js';
import type { InboxService } from './inbox.js';
import { mealUrl, menuWeekUrl, notificationTag } from './notification-links.js';
import type { PushMessage } from './push.js';
import { isPerson } from './users.js';

/** How long the other has to be quiet on the menu before the gathered notification goes. */
export const MENU_ACTIVITY_QUIET_MS = 10 * 60_000;

/** The noun of each kind of activity after a numeral, known-good: for one, and for two or more. */
const ACTIVITY_NOUNS = {
  votes: ['глас', 'гласа'],
  comments: ['коментар', 'коментара'],
  swaps: ['смяна', 'смени'],
} as const;

/** „2 гласа, 1 коментар, 1 смяна“: only the kinds that happened. */
function activitySummary(actions: readonly MenuActivityAction[]): string {
  return (Object.keys(ACTIVITY_NOUNS) as (keyof typeof ACTIVITY_NOUNS)[])
    .map(
      (kind) => [kind, actions.filter((a) => a.kind === kind).length] as const,
    )
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => {
      const [one, many] = ACTIVITY_NOUNS[kind];
      return `${count} ${count === 1 ? one : many}`;
    })
    .join(', ');
}

/**
 * The details of the notification (GLOSSARY: Известие от Съгласуването): each action under its day, the days in order
 * and the actions of a day in the order they were done, each opening its meal in the menu of the week: „Вторник: Поли
 * смени „Пиле“ → „Мусака““.
 */
function activityDetails(
  actions: readonly MenuActivityAction[],
  names: ReadonlyMap<string, string>,
): InboxDetail[] {
  // A stable sort: the actions come in the order they were done.
  return [...actions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((action) => {
      const day = weekdayName(action.date);
      return {
        text: `${day.charAt(0).toUpperCase()}${day.slice(1)}: ${names.get(action.actorUserId) ?? ''} ${action.text}`,
        url: mealUrl({ id: action.mealId, date: action.date }),
      };
    });
}

const dayMonth = new Intl.DateTimeFormat('bg-BG', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** „3–9 ноември“, or „30 ноември – 6 декември“ for a week across two months. */
function weekRange(weekStart: DateKey): string {
  const parts = (key: string) => {
    const all = dayMonth.formatToParts(new Date(`${key}T00:00:00Z`));
    const value = (type: string) =>
      all.find((part) => part.type === type)?.value ?? '';
    return { day: value('day'), month: value('month') };
  };
  const first = parts(weekStart);
  const last = parts(addDays(weekStart, 6));
  return first.month === last.month
    ? `${first.day}–${last.day} ${last.month}`
    : `${first.day} ${first.month} – ${last.day} ${last.month}`;
}

/** Where a menu notification opens, and the tag that makes the newer one of a week replace the older. */
function ofWeek(weekStart: DateKey): Pick<PushMessage, 'tag' | 'url'> {
  return { tag: notificationTag.menu(weekStart), url: menuWeekUrl(weekStart) };
}

/** Notifications of kind `menu` (GLOSSARY: Известие от Съгласуването); created once in `buildApp()`. */
export interface MenuNotifications {
  /**
   * Sends each person the actions of others on a week's menu that have been quiet for {@link MENU_ACTIVITY_QUIET_MS},
   * one notification per week, and forgets them. Run by the cron's `reminders` job.
   */
  sendQuietActivity(): Promise<void>;
  /**
   * „Ново предложение за меню“ to everyone but the one who asked for it (all of them for the cron's): „Дани предложи
   * меню за 2–8 ноември · „<подсказка>““, or „Ново меню за 2–8 ноември“ for the cron's. Never rejects.
   */
  proposed(
    proposal: Pick<MenuProposalRequest, 'weekStart' | 'requestedBy' | 'hint'>,
  ): Promise<void>;
  /**
   * „Преработено меню“ to everyone but the one who asked for the rework: „Дани преработи менюто за 2–8 ноември ·
   * сменени 3 · „<подсказка>““. The number of changed dishes is read back, as `onDone` wrote it; none, no notification.
   * Never rejects.
   */
  reworked(rework: Pick<MenuReworkRequest, 'id' | 'weekStart'>): Promise<void>;
}

export function createMenuNotifications({
  db,
  inbox,
  now,
  log,
}: {
  db: Db;
  inbox: InboxService;
  now: () => Date;
  log: FastifyBaseLogger;
}): MenuNotifications {
  return {
    async sendQuietActivity() {
      const quiet = await takeQuietMenuActivity(
        db,
        new Date(now().getTime() - MENU_ACTIVITY_QUIET_MS),
      );
      if (quiet.length === 0) {
        return;
      }
      const users = await listPeople(db);
      const names = new Map(users.map((user) => [user.id, user.name]));
      for (const { recipientUserId, weekStart, actions } of quiet) {
        const actors = users
          .filter((other) => actions.some((a) => a.actorUserId === other.id))
          .map((other) => other.name)
          .join(' и ');
        await inbox.notify(recipientUserId, 'menu', {
          title: `${actors} по менюто`,
          body: activitySummary(actions),
          details: activityDetails(actions, names),
          ...ofWeek(weekStart),
        });
      }
    },

    async proposed({ weekStart, requestedBy, hint }) {
      try {
        // The requester may be Рецептурко; only people are told (ADR-0014).
        const users = await listUsers(db);
        const requester = users.find((user) => user.id === requestedBy);
        const what = requester
          ? `${requester.name} предложи меню за ${weekRange(weekStart)}`
          : `Ново меню за ${weekRange(weekStart)}`;
        const message: PushMessage = {
          title: 'Ново предложение за меню',
          body: withHint(what, hint),
          ...ofWeek(weekStart),
        };
        for (const user of users.filter(isPerson)) {
          if (user.id !== requestedBy) {
            await inbox.notify(user.id, 'menu', message);
          }
        }
      } catch (error) {
        log.warn({ err: error, weekStart }, 'menu proposal not notified');
      }
    },

    async reworked({ id, weekStart }) {
      try {
        const rework = await findRework(db, id);
        // An unchanged menu is no news.
        if (!rework?.changed) {
          return;
        }
        // Рецептурко may ask for it too; only people are told (ADR-0014).
        const users = await listUsers(db);
        const requester = users.find((user) => user.id === rework.requestedBy);
        const what = `${requester?.name ?? 'AI'} преработи менюто за ${weekRange(weekStart)} · сменени ${rework.changed}`;
        const message: PushMessage = {
          title: 'Преработено меню',
          body: withHint(what, rework.hint),
          ...ofWeek(weekStart),
        };
        for (const user of users.filter(isPerson)) {
          if (user.id !== rework.requestedBy) {
            await inbox.notify(user.id, 'menu', message);
          }
        }
      } catch (error) {
        log.warn({ err: error, weekStart }, 'menu rework not notified');
      }
    },
  };
}
