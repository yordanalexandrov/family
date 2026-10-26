import {
  type DateKey,
  type ShoppingList,
  shoppingListSchema,
  withCheck,
} from '@family/shared';
import { get, set, update } from 'idb-keyval';
import { ApiError } from '../../api/client';
import { logger } from '../../logger';

/*
 * Офлайн на списъка за пазаруване (IndexedDB през idb-keyval): последният успешен отговор на седмица и опашката
 * от отметки, които още не са стигнали до api-то. Само отметките се правят без връзка (епик #41: Офлайн).
 */

const listKey = (weekStart: DateKey) => `family.shopping.list.${weekStart}`;
const QUEUE_KEY = 'family.shopping.queue';

/** Отметка или разотметка, която чака връзка; изпраща се по реда си като `PUT …/checked`. */
export interface QueuedCheck {
  weekStart: DateKey;
  key: string;
  checked: boolean;
  /** Кога е направена (ISO); локално е `checkedAt`, докато api-то не запише своя. */
  at: string;
}

export interface CachedList {
  list: ShoppingList;
  fetchedAt: Date;
}

export async function writeCachedList(
  list: ShoppingList,
  fetchedAt: Date,
): Promise<void> {
  try {
    await set(listKey(list.weekStart), {
      list,
      fetchedAt: fetchedAt.toISOString(),
    });
  } catch (error) {
    logger.warn('Кешът на списъка не се записа', error);
  }
}

/** Записаният отговор за седмицата; `null`, ако няма или вече не е по договора. */
export async function readCachedList(
  weekStart: DateKey,
): Promise<CachedList | null> {
  try {
    const raw = (await get(listKey(weekStart))) as
      | { list?: unknown; fetchedAt?: unknown }
      | undefined;
    const list = shoppingListSchema.safeParse(raw?.list);
    const fetchedAt = new Date(String(raw?.fetchedAt));
    if (!list.success || Number.isNaN(fetchedAt.getTime())) {
      return null;
    }
    return { list: list.data, fetchedAt };
  } catch (error) {
    logger.warn('Кешът на списъка не се прочете', error);
    return null;
  }
}

async function readQueue(): Promise<QueuedCheck[]> {
  try {
    return ((await get(QUEUE_KEY)) as QueuedCheck[] | undefined) ?? [];
  } catch (error) {
    logger.warn('Опашката с отметки не се прочете', error);
    return [];
  }
}

/** Отметките на седмицата, които чакат, по реда им. */
export async function queuedChecks(weekStart: DateKey): Promise<QueuedCheck[]> {
  return (await readQueue()).filter((entry) => entry.weekStart === weekStart);
}

export async function enqueueCheck(entry: QueuedCheck): Promise<void> {
  await update<QueuedCheck[]>(QUEUE_KEY, (queue = []) => [...queue, entry]);
}

/** Чакащите отметки върху списъка, по реда им; ключ, който вече го няма, се пропуска. */
export function applyQueuedChecks(
  list: ShoppingList,
  queue: QueuedCheck[],
  actingUserId: string | null,
): ShoppingList {
  return queue.reduce(
    (current, entry) =>
      withCheck(current, entry.key, {
        checkedBy: entry.checked ? actingUserId : null,
        checkedAt: entry.checked ? entry.at : null,
      }),
    list,
  );
}

/** Изпращането е едно наведнъж: отметка, тръгнала веднъж, не тръгва втори път. */
let flushing: Promise<number> = Promise.resolve(0);

/**
 * Изпраща опашката по реда ѝ с `send`. Изпратеното и непоправимото (4xx, напр. 404: редът вече не е в менюто)
 * се махат; мрежова грешка, 5xx или изтекла сесия спират изпращането и оставят останалото за следващия път.
 * Връща колко записа са махнати.
 */
export function flushQueuedChecks(
  send: (entry: QueuedCheck) => Promise<unknown>,
): Promise<number> {
  flushing = flushing.then(
    () => sendAll(send),
    () => sendAll(send),
  );
  return flushing;
}

async function sendAll(
  send: (entry: QueuedCheck) => Promise<unknown>,
): Promise<number> {
  let removed = 0;
  for (;;) {
    const [entry] = await readQueue();
    if (!entry) {
      return removed;
    }
    try {
      await send(entry);
    } catch (error) {
      if (!isPermanent(error)) {
        return removed;
      }
      logger.warn('Отметката е отхвърлена и се маха от опашката', error);
    }
    await update<QueuedCheck[]>(QUEUE_KEY, (queue = []) => queue.slice(1));
    removed += 1;
  }
}

/** 4xx от api-то няма да мине и при следващ опит; изтеклата сесия ще мине след нов вход. */
function isPermanent(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    !error.isServerError() &&
    !error.isSessionExpired() &&
    error.code !== 'http_error'
  );
}
