import {
  cookTakenSchema,
  inboxUnreadCountSchema,
  type PushPayload,
  pushPayloadSchema,
} from '@family/shared';
import { logger } from '../logger';
import { type AppBadge, canBadge, showAppBadge } from './app-badge';

/** Какво `showNotification` получава; `actions` го няма в DOM типовете на TypeScript. */
export interface NotificationShowOptions {
  body: string;
  tag: string;
  data: PushPayload;
  actions: { action: string; title: string }[];
  icon: string;
  badge: string;
  /** Без звук и вибрация: потвърждение на бутон, който човекът току-що е натиснал. */
  silent?: boolean;
}

/** Отворен прозорец на приложението (`WindowClient`). */
export interface AppWindow {
  visibilityState: DocumentVisibilityState;
  focused: boolean;
  focus(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
}

/**
 * Service worker-ът, както го ползват решенията тук; `sw.ts` го сглобява от `self`. Чистите функции долу правят
 * решенията (показва ли, какво отваря, какво пита api-то) проверими без браузър.
 */
export interface PushWorker {
  /** `self.location.origin`: пътищата от payload-а стават адреси на приложението. */
  origin: string;
  /** `self.navigator`: бройката на непрочетените върху иконата (Badging API, ако го има). */
  badge: AppBadge;
  showNotification(
    title: string,
    options: NotificationShowOptions,
  ): Promise<void>;
  /** Прозорците на приложението (`clients.matchAll({ type: 'window', includeUncontrolled: true })`). */
  windows(): Promise<readonly AppWindow[]>;
  openWindow(url: string): Promise<unknown>;
  fetch(url: string, init: RequestInit): Promise<Response>;
}

/** Данните на push съобщението (`PushMessageData`); `json()` хвърля, ако не е JSON. */
export interface PushData {
  json(): unknown;
}

function readPayload(data: PushData | null): PushPayload | null {
  let json: unknown;
  try {
    json = data?.json();
  } catch (error) {
    logger.warn('push: съобщението не е JSON', error);
    return null;
  }
  const parsed = pushPayloadSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn('push: непознат payload', parsed.error.issues);
    return null;
  }
  return parsed.data;
}

async function appInFront(worker: PushWorker): Promise<boolean> {
  const windows = await worker.windows();
  return windows.some(
    (win) => win.visibilityState === 'visible' && win.focused,
  );
}

/**
 * `push`: слага бройката на непрочетените от payload-а върху иконата и показва известието от валиден payload;
 * невалиден не показва нищо.
 */
export async function onPush(
  worker: PushWorker,
  data: PushData | null,
): Promise<void> {
  const payload = readPayload(data);
  if (!payload) {
    return;
  }
  if (payload.unread !== undefined) {
    await showAppBadge(worker.badge, payload.unread);
  }
  // Видим екран (епик #110): SSE вече е показал Съгласуването на отворения екран. `thaw`, `cook` и `test` — винаги.
  if (payload.kind === 'menu' && (await appInFront(worker))) {
    return;
  }
  await show(worker, payload);
}

/** Показва `payload` с бутоните му; `data` е самият payload, за да го прочете `notificationclick`. */
function show(
  worker: PushWorker,
  payload: PushPayload,
  extra: Pick<NotificationShowOptions, 'silent'> = {},
): Promise<void> {
  return worker.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    data: payload,
    actions: (payload.actions ?? []).map(({ action, title }) => ({
      action,
      title,
    })),
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    ...extra,
  });
}

/** Показаното известие (`Notification`): `data` е payload-ът, с който е показано. */
export interface ShownNotification {
  data: unknown;
  close(): void;
}

/** Фокусира отворен прозорец на приложението и го води до `path`, или отваря нов. */
async function openApp(worker: PushWorker, path: string): Promise<void> {
  const url = new URL(path, worker.origin).href;
  const [win] = await worker.windows();
  if (!win) {
    await worker.openWindow(url);
    return;
  }
  await win.focus();
  try {
    await win.navigate(url);
  } catch (error) {
    // `navigate` иска прозорец под този service worker; отворен преди него не е.
    logger.warn('push: прозорецът не се навигира', error);
    await worker.openWindow(url);
  }
}

/**
 * Бутон (епик #110 → Бутони): `POST <post>` като човека, за когото е известието. Отговорът е изцяло в api-то; `null`,
 * ако заявката не стигна до него. `redirect: 'manual'`: изтекла сесия на Cloudflare Access пренасочва към вход, а това
 * е грешка, не успех (`opaqueredirect`, не `ok`).
 */
async function answer(
  worker: PushWorker,
  payload: PushPayload,
  post: string,
): Promise<Response | null> {
  try {
    const response = await worker.fetch(new URL(post, worker.origin).href, {
      method: 'POST',
      headers: { 'x-acting-user': payload.userId },
      redirect: 'manual',
    });
    if (!response.ok) {
      logger.warn(
        'push: бутонът не мина',
        post,
        response.status,
        response.type,
      );
    }
    return response;
  } catch (error) {
    logger.warn('push: бутонът не мина', post, error);
    return null;
  }
}

/** Името на готвача от 409 `cook_taken`; `null` за всеки друг отговор. */
async function takenBy(response: Response | null): Promise<string | null> {
  if (response?.status !== 409) {
    return null;
  }
  try {
    const parsed = cookTakenSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.cookName : null;
  } catch {
    return null;
  }
}

/**
 * „Аз“ на „Кой готви довечера“ (A-19): отговорът идва като ново известие със същия `tag` на мястото на въпроса, без
 * да отваря приложението. Без бутони, затова докосването му отваря деня на ястието (`url`).
 */
async function confirmCook(
  worker: PushWorker,
  payload: PushPayload,
  response: Response | null,
): Promise<void> {
  const reply = { ...payload, actions: [] };
  if (response?.ok) {
    await show(
      worker,
      { ...reply, title: 'Записано: готвиш ти' },
      { silent: true },
    );
    return;
  }
  const cook = await takenBy(response);
  await show(worker, {
    ...reply,
    title: cook ? `${cook} вече готви` : 'Не успях да запиша. Отвори менюто',
  });
}

/**
 * Записът на известието в кутията (`inboxId`) става прочетен като човека, за когото е, и бройката от api-то отива
 * върху иконата. Грешка само се записва: известието е натиснато, отговорът на бутона не чака това.
 */
async function readInboxItem(
  worker: PushWorker,
  payload: PushPayload,
): Promise<void> {
  if (!payload.inboxId) {
    return;
  }
  const headers = { 'x-acting-user': payload.userId };
  const at = (path: string) => new URL(path, worker.origin).href;
  try {
    const read = await worker.fetch(at(`/api/inbox/${payload.inboxId}/read`), {
      method: 'POST',
      headers,
      redirect: 'manual',
    });
    if (!read.ok) {
      logger.warn('push: известието не стана прочетено', read.status);
      return;
    }
    if (!canBadge(worker.badge)) {
      return;
    }
    const response = await worker.fetch(at('/api/inbox/unread-count'), {
      headers,
      redirect: 'manual',
    });
    const parsed = inboxUnreadCountSchema.safeParse(
      response.ok ? await response.json() : null,
    );
    if (parsed.success) {
      await showAppBadge(worker.badge, parsed.data.unread);
    }
  } catch (error) {
    logger.warn('push: известието не стана прочетено', error);
  }
}

/**
 * `notificationclick`: и тялото, и бутонът правят записа в кутията прочетен; бутон отговаря през api-то, докосване на
 * тялото отваря екрана от `url`.
 */
export async function onNotificationClick(
  worker: PushWorker,
  notification: ShownNotification,
  action: string,
): Promise<void> {
  const payload = pushPayloadSchema.parse(notification.data);
  notification.close();
  await Promise.all([
    readInboxItem(worker, payload),
    respond(worker, payload, action),
  ]);
}

async function respond(
  worker: PushWorker,
  payload: PushPayload,
  action: string,
): Promise<void> {
  const button = payload.actions?.find(
    (candidate) => candidate.action === action,
  );
  if (!button) {
    await openApp(worker, payload.url);
    return;
  }
  const response = await answer(worker, payload, button.post);
  if (payload.kind === 'cook') {
    await confirmCook(worker, payload, response);
    return;
  }
  // При грешка човекът отговаря сам от екрана на известието.
  if (!response?.ok) {
    await openApp(worker, payload.url);
  }
}
