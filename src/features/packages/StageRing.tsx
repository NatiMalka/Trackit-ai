import { motion } from 'motion/react';
import { cn } from '../../lib/cn';
import { enterFrom, useEnterAnimation } from '../../lib/motion';
import { ladderProgress, stageMeta, toneClass, type Stage } from '../tracking/stages';
import { StageIcon } from './StageIcon';

/**
 * Progress ring around the stage icon.
 *
 * Doubles as the shared element between the list card and the detail header, so
 * tapping a package feels like zooming into it rather than a page swap.
 */
export function StageRing({
  stage,
  maxLadderIndex = 0,
  size = 56,
  layoutId,
  live = false,
  className,
}: {
  stage: Stage;
  maxLadderIndex?: number;
  size?: number;
  layoutId?: string;
  live?: boolean;
  className?: string;
}) {
  const enter = useEnterAnimation();
  const meta = stageMeta(stage);
  const tone = toneClass(stage);
  const progress = ladderProgress(stage, maxLadderIndex);
  const stroke = size >= 80 ? 4 : 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <motion.div
      layoutId={layoutId}
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Slow breathing halo marks "this is the live stage" without drawing the
          eye away. Painted first so it sits behind the icon. */}
      {live && (
        <span
          aria-hidden
          className={cn('absolute inset-0 rounded-full animate-[ti-pulse_2.8s_ease-out_infinite]', tone.bg)}
        />
      )}

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        // Start the arc at 12 o'clock. Not mirrored for RTL: progress rings read
        // clockwise in both directions.
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={tone.stroke}
          strokeDasharray={circumference}
          initial={enterFrom(enter, { strokeDashoffset: circumference })}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        />
      </svg>

      <div
        className={cn('absolute grid place-items-center rounded-full', tone.bg, tone.fg)}
        style={{ inset: stroke * 2 }}
      >
        <StageIcon stage={stage} className={size >= 80 ? 'size-8' : 'size-5'} />
      </div>

      <span className="sr-only">{meta.label}</span>
    </motion.div>
  );
}
