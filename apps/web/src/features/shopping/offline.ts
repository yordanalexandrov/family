import {
  checkState,
  type DateKey,
  type ShoppingList,
  shoppingListSchema,
  withCheck,
} from '@family/shared';
import { get, set, update } from 'idb-keyval';
import { ApiError, isConnectionError } from '../../api/client';
import { logger } from '../../logger';

/*
 * Офлайн на списъка за пазаруване (IndexedDB през idb-keyval): последният успешен отговор на седмица и опашката
 * от отметки, които още не са стигнали до api-то. Само отметките се правят без връзка (епик #41: Офлайн).
 */

const listKey = (weekStart: DateKey) => `family.shopping.list.${weekStart}`;
const QUEUE_KEY = 'family.shopping.queue';

/** Отметка или разотметка, която чака връзка; изпраща се по реда си като `PUT …/checked`. */
export interface QueuedCheck {
  /** Отличава записа в опашката, за да се махне точно той. */
  id: string;
  weekStart: DateKey;
  key: string;
  checked: boolean;
  /** Действащият потребител, който я е направил; изпраща се като `X-Acting-User` и след смяна на потребителя. */
  actingUser: string | null;
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

/**
 * Записите в опашката, които още не са стигнали до IndexedDB. Четенето ги изчаква: презареждане, тръгнало веднага
 * след отметка, вижда и нея (иначе показва реда неотметнат, докато не дойде следващото).
 */
let queueWrites: Promise<unknown> = Promise.resolve();

async function readQueue(): Promise<QueuedCheck[]> {
  await queueWrites;
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

/** Добавя отметката в края на опашката; четене, тръгнало след извикването, я вижда. */
export function enqueueCheck(entry: Omit<QueuedCheck, 'id'>): Promise<void> {
  const queued = { ...entry, id: crypto.randomUUID() };
  const write = update<QueuedCheck[]>(QUEUE_KEY, (queue = []) => [
    ...queue,
    queued,
  ]);
  queueWrites = Promise.allSettled([queueWrites, write]);
  return write;
}

/** Чакащите отметки върху списъка, по реда им, всяка от името на този, който я е направил. */
export function applyQueuedChecks(
  list: ShoppingList,
  queue: Omit<QueuedCheck, 'id'>[],
): ShoppingList {
  return queue.reduce(
    (current, entry) =>
      withCheck(
        current,
        entry.key,
        checkState(entry.checked, entry.actingUser, entry.at),
      ),
    list,
  );
}

/** Изпращането е едно наведнъж: отметка, тръгнала веднъж, не тръгва втори път. */
let flushing: Promise<number> = Promise.resolve(0);

/**
 * Изпраща опашката по реда ѝ с `send`. Изпратеното и 404 (редът или менюто вече ги няма) се махат. Друг 4xx
 * остава за следващия път, а по-късните отметки за същия ред чакат с него, за да не се разменя редът им. Мрежова
 * грешка, 5xx или изтекла сесия спират изпращането и оставят всичко останало. Не хвърля: повреден IndexedDB само
 * се логва, за да не пречи на четенето на списъка. Връща колко записа са махнати.
 */
export function flushQueuedChecks(
  send: (entry: QueuedCheck) => Promise<unknown>,
): Promise<number> {
  const run = () =>
    sendAll(send).catch((error: unknown) => {
      logger.warn('Опашката с отметки не се изпрати', error);
      return 0;
    });
  flushing = flushing.then(run, run);
  return flushing;
}

type Outcome = 'done' | 'retry_later' | 'stop';

async function sendAll(
  send: (entry: QueuedCheck) => Promise<unknown>,
): Promise<number> {
  let removed = 0;
  const waiting = new Set<string>();
  const slot = (entry: QueuedCheck) => `${entry.weekStart}|${entry.key}`;
  for (;;) {
    const entry = (await readQueue()).find((e) => !waiting.has(slot(e)));
    if (!entry) {
      return removed;
    }
    const outcome = await sendOne(send, entry);
    if (outcome === 'stop') {
      return removed;
    }
    if (outcome === 'retry_later') {
      waiting.add(slot(entry));
      continue;
    }
    await update<QueuedCheck[]>(QUEUE_KEY, (queue = []) =>
      queue.filter((e) => e.id !== entry.id),
    );
    removed += 1;
  }
}

async function sendOne(
  send: (entry: QueuedCheck) => Promise<unknown>,
  entry: QueuedCheck,
): Promise<Outcome> {
  try {
    await send(entry);
    return 'done';
  } catch (error) {
    if (
      isConnectionError(error) ||
      (error instanceof ApiError && error.isSessionExpired())
    ) {
      return 'stop';
    }
    if (error instanceof ApiError && error.status === 404) {
      logger.warn('Редът вече го няма; отметката се маха от опашката', error);
      return 'done';
    }
    logger.warn('Отметката е отхвърлена; остава за следващия път', error);
    return 'retry_later';
  }
}
