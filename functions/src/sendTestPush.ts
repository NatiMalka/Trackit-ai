import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

if (getApps().length === 0) initializeApp();

/** Long enough to swipe home on iPhone before FCM arrives. */
const DELAY_MS = 10_000;

interface PushDoc {
  tokens?: Record<string, { updatedAt?: string }>;
}

/**
 * Sends a dummy banner to the caller's registered devices.
 *
 * The wait happens on the server so the user can close the PWA first: iOS only
 * shows a real lock-screen notification when the Home Screen app is not focused.
 * The Function keeps running after the phone backgrounds the request.
 */
export const sendTestPush = onCall(
  {
    region: 'europe-west1',
    cors: true,
    // Auth is enough: this only targets the caller's own tokens.
    enforceAppCheck: false,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'נדרשת התחברות כדי לשלוח התראת בדיקה.');
    }

    const snap = await getFirestore().doc(`users/${uid}/meta/push`).get();
    const tokens = Object.keys(((snap.data() ?? {}) as PushDoc).tokens ?? {});
    if (tokens.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'אין מכשיר רשום להתראות. אשר התראות באפליקציה מהמסך הבית ונסה שוב.',
      );
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: 'בדיקת התראה',
        body: 'אם אתה רואה את זה, ההתראות עובדות גם כשהאפליקציה סגורה.',
      },
      data: { url: '/', tag: 'test-push' },
      webpush: {
        fcmOptions: { link: '/' },
        notification: { icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', dir: 'rtl', lang: 'he' },
      },
    });

    const sent = response.successCount;
    if (sent === 0) {
      const first = response.responses.find((r) => r.error)?.error?.message;
      throw new HttpsError('internal', first ?? 'השליחה נכשלה. נסה לאשר התראות מחדש.');
    }

    return { sent, delaySec: DELAY_MS / 1000 };
  },
);
