import { fetchTracking, releaseTracking, resumeTracking } from './ship24Client';
import { detectCarrier } from './carriers';
import { normalizeEvents } from './normalize';
import { TrackingProviderError, type ProviderResult, type TrackingProvider } from './provider';

function apiKey(): string {
  return import.meta.env.VITE_SHIP24_API_KEY?.trim() ?? '';
}

function toResult(raw: Awaited<ReturnType<typeof fetchTracking>>): ProviderResult {
  return {
    trackingNumber: raw.trackingNumber,
    carrier: raw.carrier,
    source: raw.source,
    notFound: raw.notFound,
    events: normalizeEvents(raw.events ?? []),
    trackerIds: raw.trackerIds,
  };
}

function explain(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b401\b/.test(message) || /\b403\b/.test(message)) {
    throw new TrackingProviderError(
      'מפתח Ship24 נדחה. בדוק שהעתקת את המפתח המלא (מתחיל ב-apik_) ושהתוכנית היא per-shipment, לא per-call.',
      { cause: err },
    );
  }
  if (/\b429\b/.test(message)) {
    throw new TrackingProviderError('נגמרה מכסת Ship24 לחודש הזה. חכה לחידוש או שדרג תוכנית.', { cause: err });
  }
  throw new TrackingProviderError('לא הצלחנו לקבל נתונים מ־Ship24. נסה שוב בעוד רגע.', { cause: err });
}

/**
 * Calls Ship24 from the browser. The API key is in the client bundle — fine for
 * a personal app, not for a public one. First lookup of a number can take up to
 * a minute while Ship24 creates the tracker.
 */
export const ship24Provider: TrackingProvider = {
  id: 'ship24',
  label: 'Ship24 (ישירות מהדפדפן)',

  async track(trackingNumber, carrier) {
    const key = apiKey();
    if (!key) {
      throw new TrackingProviderError('חסר VITE_SHIP24_API_KEY ב־.env.local. הדבק את המפתח מ־Ship24 והפעל מחדש את npm run dev.');
    }
    try {
      const hinted = carrier && carrier !== 'unknown' ? carrier : detectCarrier(trackingNumber)?.carrier;
      return toResult(await fetchTracking(key, trackingNumber, { courier: hinted }));
    } catch (err) {
      if (err instanceof TrackingProviderError) throw err;
      explain(err);
    }
  },

  async release(trackingNumber, trackerIds) {
    const key = apiKey();
    if (!key) return;
    try {
      await releaseTracking(key, trackingNumber, trackerIds);
    } catch (err) {
      console.warn('[trackit] ship24 release failed', err);
    }
  },

  async resume(trackerIds) {
    const key = apiKey();
    if (!key || trackerIds.length === 0) return;
    try {
      await resumeTracking(key, trackerIds);
    } catch (err) {
      console.warn('[trackit] ship24 resume failed', err);
    }
  },
};
