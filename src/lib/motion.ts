import { useState } from 'react';
import type { Transition, Variants } from 'motion/react';

/** One rhythm for the whole app. Springs for anything spatial, tweens for fades. */
export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 };
export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 28 };
export const tween: Transition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] };
/** Exits run at ~65% of enter duration so dismissals feel responsive. */
export const tweenOut: Transition = { duration: 0.14, ease: [0.7, 0, 0.84, 0] };

export const STAGGER = 0.04;

export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER, delayChildren: 0.02 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: spring },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: tween },
  exit: { opacity: 0, y: -6, transition: tweenOut },
};

/** Press feedback that never changes layout bounds. */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: spring,
} as const;

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Whether a mount animation should run at all.
 *
 * Entry animations start from `opacity: 0`, and a hidden document has its frame
 * loop throttled — so a screen mounted in a background tab or a restored
 * session can sit invisible until the user comes back. Nobody is watching the
 * animation in that case anyway, so we render the end state directly.
 *
 * Read once at mount, deliberately: flipping mid-flight would restart
 * animations under the user rather than finishing them.
 */
export function useEnterAnimation() {
  const [enabled] = useState(() => typeof document === 'undefined' || !document.hidden);
  return enabled;
}

/** Pass to a motion component's `initial` prop alongside {@link useEnterAnimation}. */
export function enterFrom<T>(enabled: boolean, from: T) {
  return enabled ? from : (false as const);
}
