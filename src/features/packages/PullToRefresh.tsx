import { motion, useMotionValue, useTransform } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { spring } from '../../lib/motion';

const THRESHOLD = 72;

/**
 * Pull-to-refresh for the package list.
 *
 * Only arms when the scroll container is already at the top, so it never fights
 * ordinary scrolling. The indicator tracks the finger in real time rather than
 * appearing after the fact.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ReactNode }) {
  const y = useMotionValue(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);

  const indicatorOpacity = useTransform(y, [0, THRESHOLD * 0.4, THRESHOLD], [0, 0.7, 1]);
  const indicatorRotate = useTransform(y, [0, THRESHOLD], [0, 270]);
  const indicatorScale = useTransform(y, [0, THRESHOLD], [0.7, 1]);

  const atTop = () => window.scrollY <= 0;

  const onTouchStart = (e: React.TouchEvent) => {
    if (busy || !atTop()) return;
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || busy) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0 || !atTop()) {
      y.set(0);
      return;
    }
    // Rubber-band: resistance grows with distance so the pull feels physical.
    y.set(Math.min(THRESHOLD * 1.4, delta * 0.5));
  };

  const onTouchEnd = async () => {
    const pulled = y.get();
    startY.current = null;

    if (pulled >= THRESHOLD && !busy) {
      setBusy(true);
      y.set(THRESHOLD * 0.7);
      try {
        await onRefresh();
      } finally {
        setBusy(false);
        y.set(0);
      }
    } else {
      y.set(0);
    }
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="relative">
      <motion.div
        aria-hidden
        style={{ y, opacity: indicatorOpacity, scale: indicatorScale }}
        className="pointer-events-none absolute inset-x-0 -top-11 z-10 flex justify-center"
      >
        <span className="grid size-9 place-items-center rounded-full border border-line bg-elevated text-primary shadow-card">
          <motion.span style={{ rotate: busy ? undefined : indicatorRotate }} className={busy ? 'animate-spin' : ''}>
            <RefreshCw className="size-4" />
          </motion.span>
        </span>
      </motion.div>

      <motion.div style={{ y }} transition={spring}>
        {children}
      </motion.div>
    </div>
  );
}
