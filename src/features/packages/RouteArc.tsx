import { motion } from 'motion/react';
import { enterFrom, useEnterAnimation } from '../../lib/motion';
import { countryName } from '../tracking/normalize';
import { ladderProgress, toneClass, type Stage } from '../tracking/stages';
import type { TrackingEvent } from '../tracking/types';
import { CountryBadge } from './CountryBadge';

/**
 * The journey as a single arc from origin country to Israel.
 *
 * A stylised arc rather than a real map: at this zoom a map adds a heavy
 * dependency and a lot of dark-mode tile styling while conveying nothing more
 * than "it is somewhere between there and here". The arc also animates cleanly
 * and stays readable at 375px.
 *
 * Laid out start-to-end in RTL, so origin sits on the right and Israel on the
 * left, matching reading direction.
 */
export function RouteArc({
  events,
  stage,
  maxLadderIndex,
}: {
  events: TrackingEvent[];
  stage: Stage;
  maxLadderIndex: number;
}) {
  const enter = useEnterAnimation();
  // Oldest scan with a country is the origin; destination is always Israel.
  const origin = [...events].reverse().find((e) => e.countryCode)?.countryCode;
  if (!origin || origin === 'IL') return null;

  const tone = toneClass(stage);
  const progress = ladderProgress(stage, maxLadderIndex);

  const width = 320;
  const height = 92;
  const pad = 34;
  // Right-to-left path: origin at x=width-pad, destination at x=pad.
  const p0 = { x: width - pad, y: height - 22 };
  const p1 = { x: width / 2, y: 6 };
  const p2 = { x: pad, y: height - 22 };
  const path = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;

  // Point on the quadratic bezier at t. Evaluated directly rather than using
  // CSS offset-path, which still is not dependable across browsers for SVG.
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  };
  const planeAt = at(progress);

  return (
    <figure className="overflow-hidden rounded-card border border-line bg-surface p-4">
      <figcaption className="sr-only">
        מסלול החבילה מ{countryName(origin)} לישראל, כ־{Math.round(progress * 100)} אחוז מהדרך
      </figcaption>

      {/* Capped: stretched to a desktop column the arc flattens out and the
          marker's position stops reading as a point on a journey. */}
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block w-full max-w-sm" role="presentation">
        <path d={path} fill="none" strokeWidth={2} strokeDasharray="4 6" className="stroke-line-strong" />
        <motion.path
          d={path}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          className={tone.stroke}
          initial={enterFrom(enter, { pathLength: 0 })}
          animate={{ pathLength: progress }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Position marker, sitting on the curve itself so it always agrees
            with the arc. A plane glyph turns into an unreadable blob at this
            size, so this borrows the ring-and-dot language of the stage ring. */}
        <motion.g
          initial={enterFrom(enter, { x: p0.x, y: p0.y, opacity: 0 })}
          animate={{ x: planeAt.x, y: planeAt.y, opacity: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className={tone.fg}
        >
          <circle r={9} className="fill-surface stroke-current" strokeWidth={2} />
          <circle r={3.5} className="fill-current" />
        </motion.g>

        <circle cx={width - pad} cy={height - 22} r={5} className="fill-st-idle" />
        <circle cx={pad} cy={height - 22} r={5} className={progress >= 0.99 ? 'fill-st-done' : 'fill-st-idle'} />
      </svg>

      {/* Origin first: in RTL the first child renders on the right, matching the
          right-hand start of the arc. */}
      <div className="mx-auto mt-1 flex max-w-sm items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-muted">
          <CountryBadge code={origin} />
          {countryName(origin)}
        </span>
        <span className="flex items-center gap-1.5 font-medium text-muted">
          ישראל
          <CountryBadge code="IL" />
        </span>
      </div>
    </figure>
  );
}
