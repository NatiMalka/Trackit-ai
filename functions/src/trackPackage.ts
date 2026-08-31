import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { normalizeTrackingNumber } from '../../src/features/tracking/carriers';
import { fetchTracking, type TrackResult } from './ship24';

export const SHIP24_API_KEY = defineSecret('SHIP24_API_KEY');

/** One refresh of a full list must stay one round trip; this caps the blast radius. */
const MAX_ITEMS = 25;

interface Request {
  items?: Array<{ trackingNumber?: string; carrier?: string }>;
}

/**
 * The only reason this Function exists: the Ship24 key stays here as a secret
 * and never reaches the bundle, where anyone could read it out of the JS and
 * spend the quota.
 *
 * App Check is enforced and anonymous auth is required, so the endpoint cannot
 * be used as a free public tracking API.
 */
export const trackPackage = onCall<Request>(
  {
    region: 'europe-west1',
    secrets: [SHIP24_API_KEY],
    enforceAppCheck: true,
    cors: true,
    memory: '256MiB',
    timeoutSeconds: 60,
    // Anonymous auth means every visitor has a uid, so this costs the user
    // nothing while still giving us something to rate-limit against.
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'נדרשת התחברות (אנונימית) כדי לעקוב אחרי חבילה.');
    }

    const numbers = [
      ...new Set(
        (request.data.items ?? [])
          .map((item) => normalizeTrackingNumber(item.trackingNumber ?? ''))
          .filter((n) => n.length >= 6),
      ),
    ];

    if (numbers.length === 0) {
      throw new HttpsError('invalid-argument', 'לא נשלח מספר מעקב תקין.');
    }
    if (numbers.length > MAX_ITEMS) {
      throw new HttpsError('invalid-argument', `אפשר לבקש עד ${MAX_ITEMS} חבילות בבת אחת.`);
    }

    const key = SHIP24_API_KEY.value();

    // One upstream failure must not lose the other eleven packages, so each is
    // settled independently and reported as not-found rather than as an error.
    const settled = await Promise.allSettled(numbers.map((n) => fetchTracking(key, n)));

    const results: TrackResult[] = settled.map((outcome, i) => {
      const trackingNumber = numbers[i] as string;
      if (outcome.status === 'fulfilled') return outcome.value;
      console.error(`[trackit] ship24 failed for ${trackingNumber}`, outcome.reason);
      return { trackingNumber, events: [], notFound: true };
    });

    return { results };
  },
);
