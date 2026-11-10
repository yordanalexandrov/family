import type { InboxItem, NotificationKind } from '@family/shared';
import type { Db } from '../db/client.js';
import {
  countUnreadInboxItems,
  deleteInboxItemsBefore,
  listInboxItems,
  listMealAnswers,
  type MealAnswers,
  markAllInboxItemsRead,
  markInboxItemRead,
  type StoredInboxItem,
  upsertInboxItem,
} from '../db/repositories/inbox.js';
import { listUsers } from '../db/repositories/users.js';
import { NotFoundError } from './errors.js';
import { mealOfTag } from './notification-links.js';
import type { PushMessage, PushService } from './push.js';

/** How long a notification stays in the inbox after its last update; the cron deletes it then. Changed by PR. */
export const INBOX_KEEP_DAYS = 30;

const DAY_MS = 24 * 3_600_000;

/**
 * What a notification says: the push, and for one with buttons until when they make sense in the inbox (the end of the
 * dinner's day). Without `actionUntil` the buttons are only on the phone.
 */
export type InboxMessage = PushMessage & { actionUntil?: Date };

/** What {@link InboxService.notify} answers: the inbox row and how many devices rang. */
export interface Notified {
  inboxId: string;
  devices: number;
}

/**
 * The inbox (GLOSSARY: Входяща кутия), the source of every notification (ADR-0015); created once in `buildApp()` as
 * `app.inbox`.
 */
export interface InboxService {
  /**
   * The one way to tell a person something (GLOSSARY: Известие): writes it into their inbox, always, then rings their
   * devices if they have `kind` on. A kind turned off or no device stops only the push. The same `tag` updates the
   * person's row and makes it unread again; one without buttons keeps the buttons of the question it answers. Rejects
   * only when the database does.
   */
  notify(
    userId: string,
    kind: NotificationKind,
    message: InboxMessage,
  ): Promise<Notified>;
  /**
   * The person's notifications, the last updated first. The buttons come only until `actionUntil` and while no one
   * answered; after an answer, who answered instead (from the dinner as it is now); after `actionUntil`, neither.
   */
  list(userId: string): Promise<InboxItem[]>;
  unreadCount(userId: string): Promise<number>;
  /** Marks the person's notification read; {@link NotFoundError} when it is not theirs or does not exist. */
  read(userId: string, id: string): Promise<void>;
  readAll(userId: string): Promise<void>;
  /** The cron's `prune-inbox` job: deletes what was not updated for {@link INBOX_KEEP_DAYS}; answers how many. */
  prune(): Promise<number>;
}

export function createInboxService({
  db,
  push,
  now,
}: {
  db: Db;
  push: PushService;
  now: () => Date;
}): InboxService {
  return {
    async notify(userId, kind, { actionUntil, ...message }) {
      const inboxId = await upsertInboxItem(
        db,
        {
          userId,
          kind,
          tag: message.tag,
          title: message.title,
          body: message.body,
          url: message.url,
          actions: actionUntil ? (message.actions ?? null) : null,
          actionUntil: actionUntil ?? null,
        },
        now(),
      );
      const devices = await push.send(userId, kind, message);
      return { inboxId, devices };
    },
    async list(userId) {
      const at = now();
      const items = await listInboxItems(db, userId);
      const asking = new Map<StoredInboxItem, string>();
      for (const item of items) {
        const mealId = mealOfTag(item.tag);
        if (
          item.actions &&
          item.actionUntil &&
          at < item.actionUntil &&
          mealId
        ) {
          asking.set(item, mealId);
        }
      }
      if (asking.size === 0) {
        return items.map((item) => toInboxItem(item, {}));
      }
      const meals = new Map(
        (await listMealAnswers(db, [...new Set(asking.values())])).map(
          (meal) => [meal.id, meal],
        ),
      );
      const names = new Map(
        (await listUsers(db)).map((user) => [user.id, user.name]),
      );
      return items.map((item) => {
        const meal = meals.get(asking.get(item) ?? '');
        if (!meal || !item.actions) {
          return toInboxItem(item, {});
        }
        const text = answerOf(item.kind, meal, userId, names);
        return toInboxItem(
          item,
          text ? { answered: { text } } : { actions: item.actions },
        );
      });
    },
    unreadCount: (userId) => countUnreadInboxItems(db, userId),
    async read(userId, id) {
      if (!(await markInboxItemRead(db, userId, id, now()))) {
        throw new NotFoundError('Няма такова известие');
      }
    },
    readAll: (userId) => markAllInboxItemsRead(db, userId, now()),
    prune: () =>
      deleteInboxItemsBefore(
        db,
        new Date(now().getTime() - INBOX_KEEP_DAYS * DAY_MS),
      ),
  };
}

function toInboxItem(
  {
    tag: _tag,
    actions: _actions,
    actionUntil: _until,
    ...item
  }: StoredInboxItem,
  buttons: Pick<InboxItem, 'actions' | 'answered'>,
): InboxItem {
  return { ...item, ...buttons };
}

/** Who answered the buttons of a reminder about `meal`, as `userId` reads it; `null` while no one did. */
function answerOf(
  kind: NotificationKind,
  meal: MealAnswers,
  userId: string,
  names: Map<string, string>,
): string | null {
  if (kind === 'cook' && meal.cookUserId) {
    return meal.cookUserId === userId
      ? 'Ти готвиш'
      : `${names.get(meal.cookUserId) ?? 'Някой'} вече готви`;
  }
  if (kind === 'thaw' && meal.thawedAt) {
    if (meal.thawedByUserId === userId) {
      return 'Ти извади месото';
    }
    const name = meal.thawedByUserId && names.get(meal.thawedByUserId);
    return name ? `${name} извади месото` : 'Месото е извадено';
  }
  return null;
}
