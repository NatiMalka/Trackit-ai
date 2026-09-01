import { getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
 *
 * A project VAPID key is preferred, but getToken still runs without one so a
 * missing build env cannot compile this whole function away (that is what made
 * the iPhone show a fake "open from the home screen" error).
 */

let messagingInstance: Messaging | null = null;

async function existingRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  const found = await navigator.serviceWorker.getRegistration('/');
  if (found) return found;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return undefined;
  }
}

function explainPushError(err: unknown): Error {
  if (err instanceof Error && /^(ההתראות|אין הרשאת|רכיב הרקע|לא התקבל|Firebase לא)/.test(err.message)) {
    return err;
  }
  const raw = err instanceof Error ? err.message : String(err);
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
  if (code.includes('unsupported-browser') || /pushmanager|indexeddb|not supported/i.test(raw)) {
    return new Error(
      'ההתראות לא נתמכות כאן. באייפון זה עובד רק מאפליקציה שנוספה למסך הבית, ב־iOS 16.4 ומעלה.',
    );
  }
  if (/AbortError|timed out|network|failed to subscribe/i.test(raw)) {
    return new Error('הרישום נקטע. סגור לגמרי את האפליקציה (החלקה למעלה ממחליף האפליקציות) ופתח מחדש מהמסך הבית.');
  }
  return new Error('רישום ההתראות נכשל. סגור לגמרי ופתח מחדש מהמסך הבית, ואז נסה שוב.');
}

export async function registerForPush(): Promise<string | null> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase לא מוגדר בבילד הזה.');
  }
  if (!(await isSupported())) {
    throw new Error(
      'ההתראות לא נתמכות כאן. באייפון זה עובד רק מאפליקציה שנוספה למסך הבית, ב־iOS 16.4 ומעלה.',
    );
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    throw new Error('אין הרשאת התראות. אשר אותן בהגדרות ואז נסה שוב.');
  }

  try {
    messagingInstance ??= getMessaging(getFirebaseApp());
    const serviceWorkerRegistration = await existingRegistration();
    if (!serviceWorkerRegistration) {
      throw new Error('רכיב הרקע של האפליקציה עוד לא מוכן. סגור לגמרי ופתח מחדש מהמסך הבית.');
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim();
    const token = await getToken(
      messagingInstance,
      vapidKey ? { vapidKey, serviceWorkerRegistration } : { serviceWorkerRegistration },
    );
    if (!token) {
      throw new Error('לא התקבל מזהה למכשיר. סגור לגמרי ופתח מחדש מהמסך הבית.');
    }

    const uid = auth().currentUser?.uid;
    if (uid) {
      await setDoc(
        doc(db(), 'users', uid, 'meta', 'push'),
        {
          tokens: { [token]: { updatedAt: new Date().toISOString(), ua: navigator.userAgent.slice(0, 180) } },
          prefs: loadPrefs(),
        },
        { merge: true },
      ).catch((err) => {
        console.warn('[trackit] failed to store push token', err);
      });
    }
    return token;
  } catch (err) {
    console.warn('[trackit] push registration failed', err);
    throw explainPushError(err);
  }
}

/** Foreground messages. The browser suppresses its own banner while the tab is focused. */
export function listenForForegroundPush(onNotify: (title: string, body: string, url?: string) => void) {
  if (!isFirebaseConfigured) return () => {};
  let unsub = () => {};
  void isSupported()
    .then((ok) => {
      if (!ok) return;
      messagingInstance ??= getMessaging(getFirebaseApp());
      unsub = onMessage(messagingInstance, (payload) => {
        const title = payload.notification?.title ?? payload.data?.title;
        const body = payload.notification?.body ?? payload.data?.body;
        if (title) onNotify(title, body ?? '', payload.data?.url);
      });
    })
    .catch(() => undefined);
  return () => unsub();
}

/**
 * Asks the server to push a dummy banner after a short delay, so you can close
 * the PWA and still see the iOS lock-screen notification.
 */
export async function requestTestPush(): Promise<{ sent: number; delaySec: number }> {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured');
  const functions = getFunctions(getFirebaseApp(), 'europe-west1');
  const call = httpsCallable<Record<string, never>, { sent: number; delaySec: number }>(functions, 'sendTestPush');
  const { data } = await call({});
  return data;
}

/** Keeps the stored prefs in step so the scheduler respects toggles immediately. */
export async function syncPrefsToServer() {
  if (!isFirebaseConfigured) return;
  const uid = auth().currentUser?.uid;
  if (!uid) return;
  await setDoc(doc(db(), 'users', uid, 'meta', 'push'), { prefs: loadPrefs() }, { merge: true });
}
