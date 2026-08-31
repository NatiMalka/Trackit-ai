import { isFirebaseConfigured } from '../../lib/firebase';
import { apiProvider } from './apiProvider';
import { mockProvider } from './mockProvider';
import { ship24Provider } from './ship24Provider';
import type { TrackingProvider } from './provider';

/**
 * The single place the data source is chosen. Everything else in the app talks
 * to the TrackingProvider interface, so this is the one file that changes when
 * moving from demo data to a paid API.
 *
 * `ship24` calls Ship24 from the browser (key in the bundle). `api` goes through
 * the Cloud Function so the key stays server-side. A Ship24 key wins over mock
 * so pasting VITE_SHIP24_API_KEY is enough to leave demo data.
 */
export function getProvider(): TrackingProvider {
  const wanted = import.meta.env.VITE_TRACKING_PROVIDER ?? 'mock';
  const hasShip24Key = Boolean(import.meta.env.VITE_SHIP24_API_KEY?.trim());

  if (wanted === 'ship24' || (wanted !== 'api' && hasShip24Key)) return ship24Provider;
  if (wanted === 'api' && isFirebaseConfigured) return apiProvider;
  return mockProvider;
}

export * from './carriers';
export * from './normalize';
export * from './provider';
export * from './stages';
export * from './types';
