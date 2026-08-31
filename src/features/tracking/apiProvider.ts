import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '../../lib/firebase';
import { normalizeEvents } from './normalize';
import { TrackingProviderError, type ProviderResult, type TrackingProvider } from './provider';
import type { Source } from './carriers';

/**
 * Real tracking data, fetched through the `trackPackage` Cloud Function.
 *
 * The tracking-API key never reaches the browser: the Function holds it as a
 * secret and this client only ever sends a tracking number. That is the whole
 * reason this provider goes via a Function instead of calling Ship24 directly.
 */

interface CallableResponse {
  results: Array<{
    trackingNumber: string;
    carrier?: string;
    source?: Source;
    notFound?: boolean;
    events: Array<{ at: string; rawText: string; location?: string; carrier?: string }>;
  }>;
}

function callable() {
  // europe-west1 keeps latency low for Israeli users.
  const functions = getFunctions(getFirebaseApp(), 'europe-west1');
  return httpsCallable<{ items: Array<{ trackingNumber: string; carrier?: string }> }, CallableResponse>(
    functions,
    'trackPackage',
  );
}

function toResult(raw: CallableResponse['results'][number]): ProviderResult {
  return {
    trackingNumber: raw.trackingNumber,
    carrier: raw.carrier,
    source: raw.source,
    notFound: raw.notFound,
    events: normalizeEvents(raw.events ?? []),
  };
}

/**
 * Turns callable error codes into something a person can act on.
 *
 * Every one of these is a setup problem, not a transient network blip, and each
 * has a different fix — so collapsing them into "refresh failed" would leave the
 * user with no way to tell which.
 */
function explain(err: unknown): never {
  const code = (err as { code?: string }).code ?? '';

  if (code.includes('not-found') || code.includes('internal') || code.includes('unavailable')) {
    throw new TrackingProviderError(
      'שירות המעקב לא זמין. ודא שה-Cloud Function פרוס ושיש מפתח API, או חזור לנתוני הדגמה בהגדרות.',
      { cause: err },
    );
  }
  if (code.includes('unauthenticated')) {
    throw new TrackingProviderError('נדרשת התחברות אנונימית. הפעל Anonymous Auth בקונסולת Firebase.', {
      cause: err,
    });
  }
  if (code.includes('permission-denied') || code.includes('app-check')) {
    throw new TrackingProviderError('הבקשה נדחתה על ידי App Check. בדוק את הגדרות reCAPTCHA.', { cause: err });
  }
  if (code.includes('invalid-argument') || code.includes('resource-exhausted')) {
    throw new TrackingProviderError(
      (err as { message?: string }).message ?? 'הבקשה נדחתה. נסה שוב עם פחות חבילות.',
      { cause: err },
    );
  }
  throw err;
}

export const apiProvider: TrackingProvider = {
  id: 'api',
  label: 'נתונים אמיתיים מהשליח',

  async track(trackingNumber, carrier) {
    try {
      const { data } = await callable()({ items: [{ trackingNumber, carrier }] });
      const first = data.results?.[0];
      if (!first) return { trackingNumber, events: [], notFound: true };
      return toResult(first);
    } catch (err) {
      explain(err);
    }
  },

  // Batched so a refresh of twelve packages costs one round trip, which matters
  // when the upstream provider bills per API call.
  async trackMany(items) {
    if (items.length === 0) return [];
    try {
      const { data } = await callable()({ items });
      return (data.results ?? []).map(toResult);
    } catch (err) {
      explain(err);
    }
  },
};
