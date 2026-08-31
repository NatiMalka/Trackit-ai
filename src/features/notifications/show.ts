import type { NotificationDecision } from './rules';

/** System banner for an in-app poll. No-op without permission, or if that package is already open. */
export async function showLocalNotification(decision: NotificationDecision): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (typeof location !== 'undefined' && location.pathname === decision.url) return;

  const options = {
    body: decision.body,
    tag: decision.dedupeKey,
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    lang: 'he',
    dir: 'rtl',
    data: { url: decision.url },
    renotify: true,
  } as NotificationOptions;

  try {
    const reg =
      'serviceWorker' in navigator
        ? ((await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.ready.catch(() => undefined)))
        : undefined;
    if (reg) {
      await reg.showNotification(decision.title, options);
      return;
    }
  } catch {
    /* fall through to the page Notification API */
  }

  try {
    new Notification(decision.title, options);
  } catch {
    /* iOS Safari outside a PWA, or a locked-down iframe */
  }
}
