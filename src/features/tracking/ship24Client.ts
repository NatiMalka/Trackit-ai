import { detectCarrier, type Source } from './carriers';

/**
 * Ship24 HTTP client. Framework-free so the browser and the Cloud Function
 * share one mapper: a courier slug must mean the same carrier in both places.
 *
 * Ship24 reflects CORS origins, so a personal-app key in the client can call
 * this directly. The Function path still exists for when the key should stay
 * off the bundle.
 */

const BASE = 'https://api.ship24.com/public/v1';

export interface RawEvent {
  at: string;
  rawText: string;
  location?: string;
  carrier?: string;
}

export interface TrackResult {
  trackingNumber: string;
  carrier?: string;
  source?: Source;
  notFound?: boolean;
  events: RawEvent[];
  /** Ship24 tracker ids for this number — needed so delete can unsubscribe. */
  trackerIds?: string[];
}

interface Ship24Event {
  occurrenceDatetime?: string;
  datetime?: string;
  status?: string;
  statusMilestone?: string;
  location?: string;
  courierCode?: string;
}

interface Ship24Tracking {
  tracker?: { trackerId?: string; trackingNumber?: string; courierCode?: string[] };
  shipment?: { statusMilestone?: string };
  events?: Ship24Event[];
}

interface Ship24Response {
  data?: { trackings?: Ship24Tracking[] };
  errors?: Array<{ message?: string }>;
}

const COURIER_CODES: Record<string, string> = {
  cainiao: 'cainiao',
  'cn-cainiao': 'cainiao',
  'cn-post': 'china-post',
  'cn-chinapost': 'china-post',
  'cn-yanwen': 'yanwen',
  yanwen: 'yanwen',
  '4px': '4px',
  'cn-4px': '4px',
  yunexpress: 'yunexpress',
  'cn-yunexpress': 'yunexpress',
  'sf-express': 'sf-express',
  'cn-sfexpress': 'sf-express',
  shein: 'shein-express',
  'cn-shein': 'shein-express',
  amazon: 'amazon-logistics',
  'amazon-logistics': 'amazon-logistics',
  'us-usps': 'usps',
  usps: 'usps',
  ups: 'ups',
  fedex: 'fedex',
  dhl: 'dhl',
  'dhl-express': 'dhl',
  'dhl-ecommerce': 'dhl',
  'gb-royalmail': 'royal-mail',
  'il-post': 'israel-post',
  'il-israelpost': 'israel-post',
  'israel-post': 'israel-post',
  'il-chita': 'chita-delivery',
  'il-hfd': 'hfd',
};

/** Our carrier ids → Ship24 courierCode. Auto-detect misses AP/LP Cainiao numbers. */
const TO_SHIP24: Record<string, string> = {
  cainiao: 'cainiao',
  'china-post': 'cn-post',
  yanwen: 'yanwen',
  '4px': '4px',
  yunexpress: 'yunexpress',
  'sf-express': 'sf-express',
  'shein-express': 'shein',
  'amazon-logistics': 'amazon',
  usps: 'usps',
  ups: 'ups',
  fedex: 'fedex',
  dhl: 'dhl',
  'royal-mail': 'gb-royalmail',
  'israel-post': 'il-post',
};

export interface TrackOptions {
  courier?: string;
}

function toCarrierId(codes: string[] | undefined): string | undefined {
  for (const code of codes ?? []) {
    const mapped = COURIER_CODES[code.toLowerCase()];
    if (mapped) return mapped;
  }
  return undefined;
}

function eventTime(e: Ship24Event): string | undefined {
  const raw = e.occurrenceDatetime ?? e.datetime;
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function toResult(trackingNumber: string, tracking: Ship24Tracking | undefined): TrackResult {
  if (!tracking) return { trackingNumber, events: [], notFound: true };

  const events = (tracking.events ?? [])
    .map((e): RawEvent | undefined => {
      const at = eventTime(e);
      if (!at || !e.status) return undefined;
      return {
        at,
        rawText: e.status,
        location: e.location || undefined,
        carrier: toCarrierId(e.courierCode ? [e.courierCode] : undefined),
      };
    })
    .filter((e): e is RawEvent => e !== undefined)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const ids = trackerIdsFrom(tracking ? [tracking] : []);
  return {
    trackingNumber,
    carrier: toCarrierId(tracking.tracker?.courierCode),
    events,
    notFound: events.length === 0,
    ...(ids.length ? { trackerIds: ids } : {}),
  };
}

function trackerIdsFrom(trackings: Ship24Tracking[] | undefined): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const t of trackings ?? []) {
    const id = t.tracker?.trackerId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Prefer the tracker that actually has scans when several exist for one number. */
function pickBest(trackings: Ship24Tracking[] | undefined): Ship24Tracking | undefined {
  if (!trackings?.length) return undefined;
  return [...trackings].sort((a, b) => (b.events?.length ?? 0) - (a.events?.length ?? 0))[0];
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * An earlier call without a courier hint can leave an empty pending tracker.
 * POST /trackers/track is idempotent on payload, so the empty one is reused
 * unless we send extra hints. Search still finds a later, better tracker.
 */
async function searchExisting(apiKey: string, trackingNumber: string): Promise<TrackResult> {
  const response = await fetch(`${BASE}/trackers/search/${encodeURIComponent(trackingNumber)}/results`, {
    headers: authHeaders(apiKey),
  });
  if (!response.ok) return { trackingNumber, events: [], notFound: true };
  const body = (await response.json()) as Ship24Response;
  const result = toResult(trackingNumber, pickBest(body.data?.trackings));
  const ids = trackerIdsFrom(body.data?.trackings);
  return ids.length ? { ...result, trackerIds: ids } : result;
}

export async function fetchTracking(
  apiKey: string,
  trackingNumber: string,
  options: TrackOptions = {},
): Promise<TrackResult> {
  const guessed = options.courier && options.courier !== 'unknown' ? options.courier : detectCarrier(trackingNumber)?.carrier;
  const ship24Courier = guessed ? TO_SHIP24[guessed] : undefined;

  const payload: Record<string, unknown> = {
    trackingNumber,
    // This app is Israel-bound; the hint helps Ship24 pick last-mile correctly.
    destinationCountryCode: 'IL',
  };
  if (ship24Courier) payload.courierCode = [ship24Courier];

  const response = await fetch(`${BASE}/trackers/track`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (response.status === 404) return searchExisting(apiKey, trackingNumber);
  if (!response.ok) {
    throw new Error(`ship24 ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const body = (await response.json()) as Ship24Response;
  const created = toResult(trackingNumber, pickBest(body.data?.trackings));
  const createdIds = trackerIdsFrom(body.data?.trackings);
  if (created.events.length > 0) {
    return createdIds.length ? { ...created, trackerIds: createdIds } : created;
  }
  const searched = await searchExisting(apiKey, trackingNumber);
  const ids = [...new Set([...(createdIds ?? []), ...(searched.trackerIds ?? [])])];
  return ids.length ? { ...searched, trackerIds: ids } : searched;
}

/**
 * Stops Ship24 following this number. Quota is already spent at create-time
 * and is not refunded; this only ends their polling so leftover trackers
 * (empty auto-detect + the real Cainiao one) do not keep running.
 */
export async function releaseTracking(apiKey: string, trackingNumber: string, knownIds: string[] = []): Promise<void> {
  const ids = [...knownIds.filter(Boolean)];
  try {
    const found = await searchExisting(apiKey, trackingNumber);
    for (const id of found.trackerIds ?? []) {
      if (!ids.includes(id)) ids.push(id);
    }
  } catch {
    // Stored ids are enough to unsubscribe even if search is down.
  }
  await setSubscribed(apiKey, ids, false);
}

/** Re-subscribes after the user undoes a delete, so we do not create a second tracker. */
export async function resumeTracking(apiKey: string, trackerIds: string[]): Promise<void> {
  await setSubscribed(apiKey, trackerIds.filter(Boolean), true);
}

async function setSubscribed(apiKey: string, trackerIds: string[], subscribed: boolean): Promise<void> {
  await Promise.all(
    trackerIds.map(async (id) => {
      const response = await fetch(`${BASE}/trackers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: authHeaders(apiKey),
        body: JSON.stringify({ isSubscribed: subscribed }),
      });
      // 404: already gone. Anything else is worth knowing but must not block
      // deleting the card in our app.
      if (!response.ok && response.status !== 404) {
        console.warn(`[trackit] ship24 ${subscribed ? 'resume' : 'release'} ${id}: ${response.status}`);
      }
    }),
  );
}
