import type { InboxDetail, InboxItem, NotificationKind } from '@family/shared';
import type { Db } from '../db/client.js';
import {
  countUnreadInboxItems,
  deleteInboxItemsBefore,
  listInboxItems,
  listMealAnswers,
  listUsersWithButtons,
  type MealAnswers,
  markAllInboxItemsRead,
  markInboxItemRead,
  type StoredInboxItem,
  upsertInboxItem,
} from '../db/repositories/inbox.js';
import { listUsers } from '../db/repositories/users.js';
import { NotFoundError } from './errors.js';
import type { EventBus } from './events.js';
import { mealOfTag, notificationTag } from './notification-links.js';
import type { PushMessage, PushService } from './push.js';

/** How long a notification stays in the inbox after its last update; the cron deletes it then. Changed by PR. */
export const INBOX_KEEP_DAYS = 30;

const DAY_MS = 24 * 3_600_000;

/**
 * What a notification says: the push (`title`, `body`, `url`, `tag`, buttons) and what only the inbox shows — the
 * `details` under „Още“, none when left out — and, for one with buttons, until when they make sense in the inbox (the
 * end of the dinner's day). Without `actionUntil` the buttons are only on the phone.
 */
export interface InboxMessage extends PushMessage {
  details?: InboxDetail[];
  actionUntil?: Date;
}

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
   * person's row (its details too) and makes it unread again; one without buttons keeps the buttons of the question it
   * answers. The push never carries the details. Rejects only when the database does.
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
  /**
   * After the buttons of a meal's reminders may have been answered or undone („Извадих“, a cook picked, a new
   * recipe): `inbox.changed` to each who has such a reminder with buttons, so their row follows at once.
   */
  answered(mealId: string): Promise<void>;
  /** The cron's `prune-inbox` job: deletes what was not updated for {@link INBOX_KEEP_DAYS}; answers how many. */
  prune(): Promise<number>;
}

export function createInboxService({
  db,
  push,
  events,
  now,
}: {
  db: Db;
  push: PushService;
  /** `inbox.changed` to the person's streams after every write: their bell and icon badge follow. */
  events: EventBus;
  now: () => Date;
}): InboxService {
  const changed = (userId: string) =>
    events.publish({ type: 'inbox.changed', userId });
  return {
    async notify(userId, kind, { details = [], actionUntil, ...message }) {
      const inboxId = await upsertInboxItem(
        db,
        {
          userId,
          kind,
          tag: message.tag,
          title: message.title,
          body: message.body,
          url: message.url,
          details,
          actions: actionUntil ? (message.actions ?? null) : null,
          actionUntil: actionUntil ?? null,
        },
        now(),
      );
      changed(userId);
      const unread = await countUnreadInboxItems(db, userId);
      const devices = await push.send(userId, kind, {
        ...message,
        inboxId,
        unread,
      });
      return { inboxId, devices };
    },
    async answered(mealId) {
      const tags = [notificationTag.thaw(mealId), notificationTag.cook(mealId)];
      for (const userId of await listUsersWithButtons(db, tags)) {
        changed(userId);
      }
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
      changed(userId);
    },
    async readAll(userId) {
      await markAllInboxItemsRead(db, userId, now());
      changed(userId);
    },
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
