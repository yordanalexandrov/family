import {
  addDays,
  type DateKey,
  type MenuProposalRequest,
  withHint,
} from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client.js';
import {
  type MenuActivity,
  takeQuietMenuActivity,
} from '../db/repositories/menu-activity.js';
import { listUsers } from '../db/repositories/users.js';
import { menuWeekUrl, notificationTag } from './notification-links.js';
import type { PushMessage, PushService } from './push.js';

/** How long the other has to be quiet on the menu before the gathered notification goes. */
export const MENU_ACTIVITY_QUIET_MS = 10 * 60_000;

/** The noun of each kind of activity after a numeral, known-good: for one, and for two or more. */
const ACTIVITY_NOUNS = {
  votes: ['глас', 'гласа'],
  comments: ['коментар', 'коментара'],
  swaps: ['смяна', 'смени'],
} as const;

/** „2 гласа, 1 коментар, 1 смяна“: only the kinds that happened. */
function activitySummary(
  activity: Pick<MenuActivity, keyof typeof ACTIVITY_NOUNS>,
): string {
  return (Object.keys(ACTIVITY_NOUNS) as (keyof typeof ACTIVITY_NOUNS)[])
    .filter((kind) => activity[kind] > 0)
    .map((kind) => {
      const [one, many] = ACTIVITY_NOUNS[kind];
      const count = activity[kind];
      return `${count} ${count === 1 ? one : many}`;
    })
    .join(', ');
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
}

export function createMenuNotifications({
  db,
  push,
  now,
  log,
}: {
  db: Db;
  push: PushService;
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
      const users = await listUsers(db);
      for (const activity of quiet) {
        // The others are the ones who acted; with two users, the one other.
        const actors = users
          .filter((other) => other.id !== activity.recipientUserId)
          .map((other) => other.name)
          .join(' и ');
        await push.send(activity.recipientUserId, 'menu', {
          title: `${actors} по менюто`,
          body: activitySummary(activity),
          ...ofWeek(activity.weekStart),
        });
      }
    },

    async proposed({ weekStart, requestedBy, hint }) {
      try {
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
        for (const user of users) {
          if (user.id !== requestedBy) {
            await push.send(user.id, 'menu', message);
          }
        }
      } catch (error) {
        log.warn({ err: error, weekStart }, 'menu proposal not notified');
      }
    },
  };
}
