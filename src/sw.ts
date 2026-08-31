/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// --- App shell -------------------------------------------------------------

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA: every navigation resolves to the cached shell, so the app opens offline.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/__/, /\/api\//],
  }),
);

// --- Runtime caches --------------------------------------------------------

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'ti-font-css' }),
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'ti-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
);

// --- Update flow -----------------------------------------------------------

// registerType is 'prompt', so the app asks before reloading and we only
// activate when it says so. Silently swapping the worker mid-session can
// discard an in-progress "add package" flow.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('activate', () => {
  void self.clients.claim();
});

// --- Notifications ---------------------------------------------------------

// Tapping a notification should land on the package it is about, reusing an
// already-open tab when there is one.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data?.url as string | undefined) ?? '/';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// --- Firebase Cloud Messaging ---------------------------------------------

// FCM lives in this worker rather than a second firebase-messaging-sw.js,
// because only one worker can own the '/' scope and registering two is what
// silently breaks web push.
//
// The raw `push` event is handled directly instead of via the FCM SDK: pulling
// firebase/messaging into the worker bundle costs far more than reading the
// payload ourselves, and the payload shape is stable.
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: {
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
  };
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.notification?.title ?? payload.data?.title;
  if (!title) return;

  const body = payload.notification?.body ?? payload.data?.body ?? '';
  const url = payload.data?.url ?? '/';
  // Collapsing on the package means a later update for the same parcel replaces
  // the earlier banner instead of stacking three notifications about one box.
  const tag = payload.data?.tag ?? url;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      lang: 'he',
      dir: 'rtl',
      data: { url },
      renotify: true,
    } as NotificationOptions),
  );
});
