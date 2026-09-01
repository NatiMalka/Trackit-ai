import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  derivePackageState,
  estimateEta,
  hashEvents,
  normalizeEvents,
} from '../../src/features/tracking/normalize';
import { evaluatePackageNotifications, unreadAndFresh } from '../../src/features/notifications/evaluate';
import { DEFAULT_PREFS, type NotificationPrefs } from '../../src/features/notifications/rules';
import type { TrackedPackage } from '../../src/features/tracking/types';
import { fetchTracking } from './ship24';
import { SHIP24_API_KEY } from './trackPackage';

if (getApps().length === 0) initializeApp();

/**
 * Packages that have arrived, come back, or been archived are never polled
 * again: they cannot change, and every skipped poll is a billed API call saved.
 */
const TERMINAL = new Set(['DELIVERED', 'RETURNED']);

/** Skip a package the open app already refreshed in the last few minutes. */
const MIN_AGE_MS = 1000 * 60 * 4;

/** Ship24 bills per call, so a runaway fan-out is a financial bug, not just a slow one. */
const MAX_PER_RUN = 400;

interface StoredPackage extends TrackedPackage {
  /** dedupeKeys of notifications already delivered, so nothing is sent twice. */
  notified?: string[];
}

/** Mirrors what `src/features/notifications/push.ts` writes from the browser. */
interface PushDoc {
  prefs?: Partial<NotificationPrefs>;
  /** Keyed by token so a device re-registering overwrites instead of duplicating. */
  tokens?: Record<string, { updatedAt?: string }>;
}

function pushDocPath(uid: string) {
  return `users/${uid}/meta/push`;
}

type PushTarget = NotificationPrefs & { tokens: string[] };

/**
 * One read per user per run, not per package: a user with a dozen packages
 * would otherwise re-read the same preferences on every package in the run.
 */
async function loadPushTarget(uid: string, cache: Map<string, PushTarget>): Promise<PushTarget> {
  const cached = cache.get(uid);
  if (cached) return cached;

  const snap = await getFirestore().doc(pushDocPath(uid)).get();
  const data = (snap.data() ?? {}) as PushDoc;
  const target: PushTarget = { ...DEFAULT_PREFS, ...data.prefs, tokens: Object.keys(data.tokens ?? {}) };
  cache.set(uid, target);
  return target;
}

/** Only these mean the device is gone for good; everything else may succeed later. */
function isDeadToken(code: string | undefined): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument'
  );
}

/**
 * Polls every active package and writes back only what changed.
 *
 * Every 5 minutes: Ship24's per-shipment plan charges when a tracker is created,
 * not per refresh, and Cloud Scheduler/Functions stay inside the free tier at
 * this volume. MIN_AGE is 4 minutes so each tick actually picks packages up
 * instead of waiting out the previous run.
 */
export const refreshPackages = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Jerusalem',
    region: 'europe-west1',
    secrets: [SHIP24_API_KEY],
    memory: '512MiB',
    timeoutSeconds: 540,
    retryCount: 0,
  },
  async () => {
    const db = getFirestore();
    const key = SHIP24_API_KEY.value();
    const cutoff = Date.now() - MIN_AGE_MS;

    // Collection-group query so one pass covers every user without listing them.
    // Staleness is the only server-side filter: `archived`/`stage` predicates
    // would need an inequality, and Firestore inequalities silently drop
    // documents where the field is absent - exactly the packages we must not
    // lose. Cheap to filter those few in memory instead.
    const snap = await db
      .collectionGroup('packages')
      .orderBy('lastCheckedAt', 'asc')
      .limit(MAX_PER_RUN)
      .get();

    const due = snap.docs.filter((doc) => {
      const pkg = doc.data() as StoredPackage;
      if (pkg.archived || TERMINAL.has(pkg.stage)) return false;
      const checked = pkg.lastCheckedAt ? Date.parse(pkg.lastCheckedAt) : 0;
      return checked < cutoff;
    });

    console.log(`[trackit] refreshing ${due.length} of ${snap.size} candidate packages`);

    let notificationsSent = 0;
    const pushTargets = new Map<string, PushTarget>();

    for (const doc of due) {
      const pkg = doc.data() as StoredPackage;
      // users/{uid}/packages/{id}
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;

      const checkedAt = new Date().toISOString();

      try {
        const raw = await fetchTracking(key, pkg.trackingNumber);
        const events = normalizeEvents(raw.events);
        const unchanged = events.length === 0 || hashEvents(events) === hashEvents(pkg.events ?? []);

        if (unchanged) {
          await doc.ref.update({ lastCheckedAt: checkedAt });
          // Still evaluated: the pickup countdown and the gone-quiet alert are
          // driven by time passing, not by a new event, so skipping them here
          // would silence the two most valuable notifications in the app.
          notificationsSent += await notify(uid, doc.ref.path, pkg, pkg, false, pushTargets);
          continue;
        }

        const derived = derivePackageState(events, pkg.maxLadderIndex);
        const updated: StoredPackage = { ...pkg, ...derived, events };
        const prefs = await loadPushTarget(uid, pushTargets);
        const { unread } = unreadAndFresh(pkg, updated, prefs, true);

        await doc.ref.update({
          ...derived,
          events,
          carrier: raw.carrier ?? pkg.carrier,
          lastCheckedAt: checkedAt,
          unread,
          eta: estimateEta(derived.stage, derived.lastEventAt) ?? FieldValue.delete(),
        });

        notificationsSent += await notify(uid, doc.ref.path, pkg, updated, true, pushTargets);
      } catch (err) {
        // A single bad tracking number must not abort the whole run.
        console.error(`[trackit] refresh failed for ${doc.ref.path}`, err);
        await doc.ref.update({ lastCheckedAt: checkedAt }).catch(() => undefined);
      }
    }

    console.log(`[trackit] run complete, ${notificationsSent} notifications sent`);
  },
);

/**
 * Applies the same notification rules the client uses, then sends via FCM.
 *
 * Sharing `decideNotifications` with the browser is the point: the promise of
 * "only events that change what you'd do" has to hold in exactly one place.
 */
async function notify(
  uid: string,
  path: string,
  before: StoredPackage,
  after: StoredPackage,
  changed: boolean,
  pushTargets: Map<string, PushTarget>,
): Promise<number> {
  const prefs = await loadPushTarget(uid, pushTargets);
  const { unread, fresh } = unreadAndFresh(before, after, prefs, changed);
  // Unchanged polls still need pickup/stuck alerts, which unreadAndFresh skips.
  const already = new Set(before.notified ?? []);
  const toSend = changed
    ? fresh
    : evaluatePackageNotifications(before, after, prefs).filter((d) => !already.has(d.dedupeKey));
  const markUnread = unread || toSend.length > 0;
  if (toSend.length === 0) {
    if (markUnread) {
      await getFirestore().doc(path).update({ unread: true });
    }
    return 0;
  }

  if (prefs.tokens.length === 0) {
    if (markUnread) {
      await getFirestore().doc(path).update({ unread: true });
    }
    return 0;
  }

  const messaging = getMessaging();

  for (const decision of toSend) {
    const response = await messaging.sendEachForMulticast({
      tokens: prefs.tokens,
      notification: { title: decision.title, body: decision.body },
      data: { url: decision.url, tag: `${after.id}:${decision.kind}` },
      webpush: {
        fcmOptions: { link: decision.url },
        notification: { icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', dir: 'rtl', lang: 'he' },
      },
    });

    // Tokens die when a browser clears storage or the app is uninstalled.
    // Pruning only the permanently-invalid ones keeps later runs from paying for
    // guaranteed failures without discarding a device over a transient error.
    const dead = response.responses
      .map((r, i): string | undefined => (isDeadToken(r.error?.code) ? prefs.tokens[i] : undefined))
      .filter((t): t is string => t !== undefined);

    if (dead.length > 0) {
      // FieldPath rather than a dotted string: FCM tokens are opaque and must
      // not be parsed as a path.
      const [first, ...rest] = dead;
      await getFirestore()
        .doc(pushDocPath(uid))
        .update(
          new FieldPath('tokens', first as string),
          FieldValue.delete(),
          ...rest.flatMap((t) => [new FieldPath('tokens', t), FieldValue.delete()]),
        )
        .catch(() => undefined);
    }
  }

  await getFirestore()
    .doc(path)
    // Capped so the dedupe log cannot grow forever on a long-lived package.
    .update({
      notified: [...already, ...toSend.map((d) => d.dedupeKey)].slice(-40),
      ...(unread || toSend.length > 0 ? { unread: true } : {}),
    });

  return toSend.length;
}
