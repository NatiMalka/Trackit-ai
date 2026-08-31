import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

const SEEN_KEY = 'trackit.celebrated';

function alreadyCelebrated(id: string) {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]).includes(id) : false;
  } catch {
    return false;
  }
}

function markCelebrated(id: string) {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    // Cap the list so it cannot grow without bound over years of use.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list.slice(-49), id]));
  } catch {
    /* private mode: the celebration may repeat, which is harmless */
  }
}

const COLORS = ['#2e7dff', '#ff7a29', '#34d399', '#22d3ee', '#8b5cf6'];

/**
 * A brief confetti burst the first time a package is seen as delivered.
 *
 * Fires once per package, is purely decorative, and is skipped entirely under
 * prefers-reduced-motion — so it is rendered as non-interactive and hidden from
 * assistive tech rather than announced.
 */
export function DeliveryCelebration({ packageId }: { packageId: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || alreadyCelebrated(packageId)) return;
    markCelebrated(packageId);
    setShow(true);
    const timer = window.setTimeout(() => setShow(false), 2200);
    return () => window.clearTimeout(timer);
  }, [packageId]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 320,
        y: -140 - Math.random() * 220,
        rotate: (Math.random() - 0.5) * 540,
        delay: Math.random() * 0.18,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    [],
  );

  return (
    <AnimatePresence>
      {show && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
          <div className="absolute left-1/2 top-1/3">
            {pieces.map((p) => (
              <motion.span
                key={p.id}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
                transition={{ duration: 1.5 + Math.random() * 0.6, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
                className="absolute block rounded-[2px]"
                style={{ width: p.size, height: p.size * 1.6, background: p.color }}
              />
            ))}
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
