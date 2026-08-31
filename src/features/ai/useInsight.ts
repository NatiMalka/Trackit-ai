import { useEffect, useRef, useState } from 'react';
import { usePackages } from '../packages/store';
import type { AiInsight, TrackedPackage } from '../tracking/types';
import { buildInsight, isInsightFresh } from './insights';

/**
 * Keeps a package's AI insight in step with its event log.
 *
 * Generation is triggered only when the cached hash no longer matches, and the
 * result is written back to the package so every other surface — list card,
 * notifications, the "arriving soon" hero — reads the same text without
 * re-querying the model.
 */
export function useInsight(pkg: TrackedPackage | undefined) {
  const { updatePackage } = usePackages();
  // The key of the generation in flight, or null. Keyed rather than boolean so a
  // run that finishes after the user moved on cannot clear a newer run's state.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // Dedupes across the store round-trip and across StrictMode's double effect.
  const done = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pkg || pkg.events.length === 0) return;
    if (isInsightFresh(pkg)) return;

    const key = `${pkg.id}:${pkg.events.length}:${pkg.lastEventAt ?? ''}`;
    if (done.current.has(key)) return;
    done.current.add(key);

    setPendingKey(key);

    // Deliberately not cancelled on unmount: the write is idempotent, cached by
    // events hash, and useful to every other screen even if this one is gone.
    void (async () => {
      try {
        const insight = await buildInsight(pkg);
        await updatePackage(pkg.id, {
          ai: insight,
          // The AI window is better than the deterministic one, so it becomes
          // the package's ETA of record.
          ...(insight.eta ? { eta: insight.eta } : {}),
        });
      } catch (err) {
        console.error('[trackit] insight generation failed', err);
        // Let a later render retry rather than leaving the card blank forever.
        done.current.delete(key);
      } finally {
        setPendingKey((current) => (current === key ? null : current));
      }
    })();
  }, [pkg, updatePackage]);

  return {
    insight: pkg?.ai as AiInsight | undefined,
    generating: pendingKey !== null,
  };
}
