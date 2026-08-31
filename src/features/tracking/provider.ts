import type { TrackingEvent } from './types';
import type { Source } from './carriers';

/** What a provider returns for one tracking number. */
export interface ProviderResult {
  trackingNumber: string;
  /** Carrier the provider believes is handling the parcel, if it can tell. */
  carrier?: string;
  source?: Source;
  events: TrackingEvent[];
  /** Provider could not find the number at all — distinct from "found, no scans yet". */
  notFound?: boolean;
  /** Upstream tracker ids, so delete can unsubscribe the remote follow. */
  trackerIds?: string[];
}

/**
 * The seam between the app and whoever supplies tracking data.
 *
 * Everything above this interface — normalizer, UI, AI, notifications — is
 * provider-agnostic. Swapping mock data for Ship24 or TrackingMore means
 * implementing this once; no screen changes.
 */
export interface TrackingProvider {
  readonly id: string;
  /** Human name shown in Settings so the data source is never a mystery. */
  readonly label: string;
  track(trackingNumber: string, carrier?: string): Promise<ProviderResult>;
  /** Batched refresh. Providers that bill per call can override this to save quota. */
  trackMany?(
    items: Array<{ trackingNumber: string; carrier?: string }>,
  ): Promise<ProviderResult[]>;
  /** Stop following this number at the upstream API. Optional — mock has nothing to release. */
  release?(trackingNumber: string, trackerIds?: string[]): Promise<void>;
  /** Undo of release, so we do not create a second tracker for the same parcel. */
  resume?(trackerIds: string[]): Promise<void>;
}

/**
 * A failure the user can act on, carrying Hebrew copy that says what to do.
 *
 * "רענון נכשל" is useless when the real problem is that the Cloud Function was
 * never deployed, so providers raise this instead of a bare Error.
 */
export class TrackingProviderError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.name = 'TrackingProviderError';
    this.userMessage = userMessage;
  }
}

export function trackingErrorMessage(err: unknown, fallback: string): string {
  return err instanceof TrackingProviderError ? err.userMessage : fallback;
}

export async function trackAll(
  provider: TrackingProvider,
  items: Array<{ trackingNumber: string; carrier?: string }>,
): Promise<ProviderResult[]> {
  if (provider.trackMany) return provider.trackMany(items);
  return Promise.all(items.map((i) => provider.track(i.trackingNumber, i.carrier)));
}
