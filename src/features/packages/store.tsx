import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { bootstrapAuth, isFirebaseConfigured } from '../../lib/firebase';
import { getProvider, trackAll, trackingErrorMessage } from '../tracking';
import { derivePackageState, estimateEta, hashEvents } from '../tracking/normalize';
import type { PackageDraft, TrackedPackage } from '../tracking/types';
import { repositoryFor, type PackagesRepository } from './repository';

interface PackagesState {
  packages: TrackedPackage[];
  loading: boolean;
  error: string | null;
  /** Where data is stored, surfaced in Settings so it is never a surprise. */
  storage: 'firestore' | 'local';
  uid: string | null;
  /** Ids currently being polled, so individual cards can show their own spinner. */
  refreshing: Set<string>;
  addPackage: (draft: PackageDraft) => Promise<TrackedPackage>;
  removePackage: (id: string) => Promise<void>;
  restorePackage: (pkg: TrackedPackage) => Promise<void>;
  updatePackage: (id: string, changes: Partial<TrackedPackage>) => Promise<void>;
  refreshPackage: (id: string) => Promise<void>;
  refreshAll: () => Promise<void>;
}

const PackagesContext = createContext<PackagesState | null>(null);

export function usePackages() {
  const ctx = useContext(PackagesContext);
  if (!ctx) throw new Error('usePackages must be used inside <PackagesProvider>');
  return ctx;
}

export function usePackage(id: string | undefined) {
  const { packages, loading } = usePackages();
  return {
    pkg: id ? packages.find((p) => p.id === id) : undefined,
    loading,
  };
}

function newId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

/** Refresh at most this often per package, so opening the app repeatedly is cheap. */
/** Don't re-poll a package the app already refreshed in the last few hours — unless it still has no events. */
const REFRESH_COOLDOWN_MS = 1000 * 60 * 10;
const EMPTY_RETRY_MS = 1000 * 90;

export function PackagesProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [authSettled, setAuthSettled] = useState(!isFirebaseConfigured);
  const [packages, setPackages] = useState<TrackedPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());

  const repoRef = useRef<PackagesRepository | null>(null);
  const packagesRef = useRef<TrackedPackage[]>([]);
  packagesRef.current = packages;

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return bootstrapAuth((user: User | null) => {
      setUid(user?.uid ?? null);
      setAuthSettled(true);
    });
  }, []);

  // Set once Firestore has proven unreachable, which pins this session to the
  // local repository. Covers a project whose Firestore has not been provisioned
  // yet as well as rules that reject us: either way, a working device-only app
  // beats an error banner where the package list should be.
  const [forceLocal, setForceLocal] = useState(false);

  useEffect(() => {
    if (!authSettled) return;
    const repo = repositoryFor(forceLocal ? null : uid);
    repoRef.current = repo;
    setLoading(true);

    const unsub = repo.subscribe(
      (list) => {
        setPackages(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[trackit] packages subscription failed', err);
        setLoading(false);
        if (repo.kind === 'firestore') {
          setForceLocal(true);
          return;
        }
        setError('לא הצלחנו לטעון את החבילות. בדוק את החיבור ונסה לרענן.');
      },
    );
    return unsub;
  }, [authSettled, uid, forceLocal]);

  const markRefreshing = useCallback((ids: string[], active: boolean) => {
    setRefreshing((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (active ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  /**
   * Polls the provider for one or more packages and writes back only the fields
   * that actually changed. Keeping the write narrow means a refresh never
   * clobbers a nickname the user edited a moment ago.
   */
  const syncPackages = useCallback(
    async (targets: TrackedPackage[]) => {
      const repo = repoRef.current;
      if (repo === null || targets.length === 0) return;

      markRefreshing(
        targets.map((p) => p.id),
        true,
      );

      try {
        const results = await trackAll(
          getProvider(),
          targets.map((p) => ({ trackingNumber: p.trackingNumber, carrier: p.carrier })),
        );

        await Promise.all(
          results.map(async (result, i) => {
            const pkg = targets[i];
            if (!pkg) return;

            const checkedAt = new Date().toISOString();
            const trackerIds = result.trackerIds?.length ? { ship24TrackerIds: result.trackerIds } : {};
            if (result.notFound || result.events.length === 0) {
              await repo.patch(pkg.id, { lastCheckedAt: checkedAt, ...trackerIds });
              return;
            }

            const derived = derivePackageState(result.events, pkg.maxLadderIndex);
            const changed = hashEvents(result.events) !== hashEvents(pkg.events ?? []);

            await repo.patch(pkg.id, {
              ...derived,
              events: result.events,
              carrier: result.carrier ?? pkg.carrier,
              lastCheckedAt: checkedAt,
              ...trackerIds,
              // Only recompute the deterministic ETA when the journey moved;
              // otherwise the estimate would creep forward every poll.
              ...(changed ? { eta: estimateEta(derived.stage, derived.lastEventAt) } : {}),
            });
          }),
        );
      } catch (err) {
        console.error('[trackit] refresh failed', err);
        setError(trackingErrorMessage(err, 'רענון הנתונים נכשל. ננסה שוב בפעם הבאה שתפתח את האפליקציה.'));
      } finally {
        markRefreshing(
          targets.map((p) => p.id),
          false,
        );
      }
    },
    [markRefreshing],
  );

  const addPackage = useCallback(
    async (draft: PackageDraft) => {
      const repo = repoRef.current ?? repositoryFor(uid);
      const now = new Date().toISOString();
      const pkg: TrackedPackage = {
        id: newId(),
        trackingNumber: draft.trackingNumber,
        carrier: draft.carrier,
        source: draft.source,
        nickname: draft.nickname,
        itemName: draft.itemName,
        colorTag: draft.colorTag,
        stage: 'UNKNOWN',
        maxLadderIndex: 0,
        events: [],
        createdAt: now,
        // Set up front, not left blank until the first poll answers: the
        // scheduled refresh Function orders by this field, and Firestore
        // ordering drops documents that lack it.
        lastCheckedAt: now,
      };
      await repo.save(pkg);
      // Fire and forget: the card appears immediately and fills in when the
      // provider answers, rather than blocking the add flow on the network.
      void syncPackages([pkg]);
      return pkg;
    },
    [syncPackages, uid],
  );

  const removePackage = useCallback(async (id: string) => {
    const pkg = packagesRef.current.find((p) => p.id === id);
    await repoRef.current?.remove(id);
    // Local delete is the source of truth. Ship24 unsubscribe is best-effort:
    // the quota was already spent when the tracker was created, but stopping
    // their follow keeps the dashboard from filling with parcels we no longer care about.
    const provider = getProvider();
    if (pkg && provider.release) {
      void provider.release(pkg.trackingNumber, pkg.ship24TrackerIds).catch((err) => {
        console.warn('[trackit] upstream release failed', err);
      });
    }
  }, []);

  const restorePackage = useCallback(async (pkg: TrackedPackage) => {
    await repoRef.current?.save(pkg);
    const provider = getProvider();
    if (provider.resume && pkg.ship24TrackerIds?.length) {
      void provider.resume(pkg.ship24TrackerIds).catch((err) => {
        console.warn('[trackit] upstream resume failed', err);
      });
    }
  }, []);

  const updatePackage = useCallback(async (id: string, changes: Partial<TrackedPackage>) => {
    await repoRef.current?.patch(id, changes);
  }, []);

  const refreshPackage = useCallback(
    async (id: string) => {
      const pkg = packagesRef.current.find((p) => p.id === id);
      if (pkg) await syncPackages([pkg]);
    },
    [syncPackages],
  );

  const refreshAll = useCallback(async () => {
    const active = packagesRef.current.filter((p) => !p.archived && p.stage !== 'DELIVERED');
    await syncPackages(active);
  }, [syncPackages]);

  // Catch-up refresh on open. Anything polled recently is skipped, and delivered
  // packages are never polled again.
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (loading || didAutoRefresh.current || packages.length === 0) return;
    didAutoRefresh.current = true;
    const stale = packages.filter(
      (p) =>
        !p.archived &&
        p.stage !== 'DELIVERED' &&
        p.stage !== 'RETURNED' &&
        (!p.lastCheckedAt ||
          Date.now() - Date.parse(p.lastCheckedAt) >
            ((p.events?.length ?? 0) === 0 ? EMPTY_RETRY_MS : REFRESH_COOLDOWN_MS)),
    );
    if (stale.length > 0) void syncPackages(stale);
  }, [loading, packages, syncPackages]);

  const value = useMemo<PackagesState>(
    () => ({
      packages,
      loading,
      error,
      storage: forceLocal ? 'local' : (repoRef.current?.kind ?? 'local'),
      uid,
      refreshing,
      addPackage,
      removePackage,
      restorePackage,
      updatePackage,
      refreshPackage,
      refreshAll,
    }),
    [
      packages,
      loading,
      error,
      forceLocal,
      uid,
      refreshing,
      addPackage,
      removePackage,
      restorePackage,
      updatePackage,
      refreshPackage,
      refreshAll,
    ],
  );

  return <PackagesContext.Provider value={value}>{children}</PackagesContext.Provider>;
}
