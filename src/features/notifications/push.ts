import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, getFirebaseApp, isFirebaseConfigured } from '../../lib/firebase';
import { loadPrefs } from './prefs';

/**
 * Web push registration.
 *
 * The FCM token is bound to the *existing* PWA service worker rather than a
 * separate firebase-messaging-sw.js: only one worker can own the '/' scope, and
 * registering a second one is what breaks push in most Vite PWA setups. The
 * worker is built from src/sw.ts via the injectManifest strategy.
 */

let messagingInstance: Messaging | null = null;

async function existingRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  // vite-plugin-pwa has already registered it by this point; we reuse it rather
  // than registering anything new.
  return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.ready);
}

export async function registerForPush(): Promise<string | null> {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!isFirebaseConfigured || !vapidKey) {
    console.info('[trackit] push not configured (needs VITE_FIREBASE_VAPID_KEY)');
    return null;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;

  try {
    messagingInstance ??= getMessaging(getFirebaseApp());
    const serviceWorkerRegistration = await existingRegistration();
    const token = await getToken(messagingInstance, { vapidKey, serviceWorkerRegistration });
    if (!token) return null;

    // The scheduled Function reads this doc to know where to send.
    const uid = auth().currentUser?.uid;
    if (uid) {
      await setDoc(
        doc(db(), 'users', uid, 'meta', 'push'),
        {
          tokens: { [token]: { updatedAt: new Date().toISOString(), ua: navigator.userAgent.slice(0, 180) } },
          prefs: loadPrefs(),
        },
        { merge: true },
      );
    }
    return token;
  } catch (err) {
    console.warn('[trackit] push registration failed', err);
    return null;
  }
}

/** Foreground messages. The browser suppresses its own banner while the tab is focused. */
export function listenForForegroundPush(onNotify: (title: string, body: string, url?: string) => void) {
  if (!isFirebaseConfigured) return () => {};
  try {
    messagingInstance ??= getMessaging(getFirebaseApp());
    return onMessage(messagingInstance, (payload) => {
      const title = payload.notification?.title ?? payload.data?.title;
      const body = payload.notification?.body ?? payload.data?.body;
      if (title) onNotify(title, body ?? '', payload.data?.url);
    });
  } catch {
    return () => {};
  }
}

/** Keeps the stored prefs in step so the scheduler respects toggles immediately. */
export async function syncPrefsToServer() {
  if (!isFirebaseConfigured) return;
  const uid = auth().currentUser?.uid;
  if (!uid) return;
  await setDoc(doc(db(), 'users', uid, 'meta', 'push'), { prefs: loadPrefs() }, { merge: true });
}
