import type { InboxDetail, InboxItem, NotificationKind } from '@family/shared';
import type { Db } from '../db/client.js';
import {
  countUnreadInboxItems,
  deleteInboxItemsBefore,
  listInboxItems,
  markAllInboxItemsRead,
  markInboxItemRead,
  upsertInboxItem,
} from '../db/repositories/inbox.js';
import { NotFoundError } from './errors.js';
import type { PushMessage, PushService } from './push.js';

/** How long a notification stays in the inbox after its last update; the cron deletes it then. Changed by PR. */
export const INBOX_KEEP_DAYS = 30;

const DAY_MS = 24 * 3_600_000;

/**
 * What a notification says: the push (`title`, `body`, `url`, `tag`, buttons) and what only the inbox shows — the
 * `details` under „Още“, none when left out.
 */
export interface InboxMessage extends PushMessage {
  details?: InboxDetail[];
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
   * person's row (its details too) and makes it unread again. The push never carries the details. Rejects only when
   * the database does.
   */
  notify(
    userId: string,
    kind: NotificationKind,
    message: InboxMessage,
  ): Promise<Notified>;
  /** The person's notifications, the last updated first. */
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
    async notify(userId, kind, { details = [], ...message }) {
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
        },
        now(),
      );
      const devices = await push.send(userId, kind, message);
      return { inboxId, devices };
    },
    list: (userId) => listInboxItems(db, userId),
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
