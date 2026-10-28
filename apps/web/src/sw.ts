/*
 * Service worker-ът на PWA-то (vite-plugin-pwa, injectManifest). Кешът е както при предишния generateSW; известията
 * (епик Напомняния #110) само свързват събитията с решенията в app/push-handlers.ts.
 */
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import {
  type AppWindow,
  onNotificationClick,
  onPush,
  type PushWorker,
} from './app/push-handlers';
import {
  isShareTarget,
  receiveShare,
} from './features/recipe-import/shared-photo';

declare const self: ServiceWorkerGlobalScope;

// „Сподели → Семейство“: share target-ът е POST, който сървърът няма; поема се тук, преди маршрутите на Workbox (те и
// без това са само за GET).
self.addEventListener('fetch', (event) => {
  if (isShareTarget(event.request, self.location.origin)) {
    event.respondWith(receiveShare(event.request, self.location.origin));
  }
});

// Сглобените файлове, включително Inter (woff2), за да работи приложението офлайн.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Навигация към api/healthz не е страница на приложението.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/healthz/],
  }),
);

// /api/* само от мрежата, без кеш. Потокът `/api/events` (SSE) не минава през service worker-а изобщо: браузърът
// го отваря директно, без посредник, който да го буферира или прекъсне.
registerRoute(
  ({ url, sameOrigin }) =>
    sameOrigin &&
    url.pathname.startsWith('/api/') &&
    url.pathname !== '/api/events',
  new NetworkOnly(),
);

// registerType: 'autoUpdate' — новата версия поема веднага.
self.skipWaiting();
clientsClaim();

const worker: PushWorker = {
  origin: self.location.origin,
  showNotification: (title, options) =>
    self.registration.showNotification(title, options),
  windows: async () =>
    (await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })) satisfies readonly AppWindow[],
  openWindow: (url) => self.clients.openWindow(url),
  fetch: (url, init) => self.fetch(url, init),
};

self.addEventListener('push', (event) => {
  event.waitUntil(onPush(worker, event.data));
});

self.addEventListener('notificationclick', (event) => {
  event.waitUntil(
    onNotificationClick(worker, event.notification, event.action),
  );
});
