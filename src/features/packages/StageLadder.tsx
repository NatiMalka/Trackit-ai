import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { enterFrom, spring, useEnterAnimation } from '../../lib/motion';
import { isOnLadder, STAGE_LADDER, stageMeta, toneClass, type Stage } from '../tracking/stages';
import { StageIcon } from './StageIcon';

/**
 * The nine-rung journey, laid out horizontally.
 *
 * Nodes run start-to-end, which in RTL means right-to-left — the direction
 * Hebrew readers already scan, so "forward" needs no explanation. Only the
 * active rung is labelled, keeping nine steps legible at 375px.
 */
export function StageLadder({ stage, maxLadderIndex = 0 }: { stage: Stage; maxLadderIndex?: number }) {
  const enter = useEnterAnimation();
  const meta = stageMeta(stage);
  const tone = toneClass(stage);
  const activeIndex = isOnLadder(stage) ? meta.index : maxLadderIndex;
  const offLadder = !isOnLadder(stage);

  return (
    <div className="space-y-3">
      <ol
        aria-label="שלבי המשלוח"
        className="flex items-center justify-between gap-0.5"
      >
        {STAGE_LADDER.map((s, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex && !offLadder;
          const label = stageMeta(s).label;

          return (
            <li key={s} className="flex min-w-0 flex-1 items-center last:flex-none">
              <span
                aria-current={current ? 'step' : undefined}
                title={label}
                className={cn(
                  'grid shrink-0 place-items-center rounded-full transition-colors duration-300',
                  current ? cn('size-9', tone.bg, tone.fg) : 'size-7',
                  done && 'bg-st-done-soft text-st-done',
                  !done && !current && 'bg-elevated text-subtle',
                )}
              >
                {done ? (
                  <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
                ) : current ? (
                  <StageIcon stage={s} className="size-4" />
                ) : (
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                )}
                <span className="sr-only">
                  {label}
                  {done ? ' — הושלם' : current ? ' — השלב הנוכחי' : ''}
                </span>
              </span>

              {i < STAGE_LADDER.length - 1 && (
                <span aria-hidden className="mx-0.5 h-0.5 min-w-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  {/* Draws in on mount, so the journey reads as motion forward. */}
                  <motion.span
                    initial={enterFrom(enter, { scaleX: 0 })}
                    animate={{ scaleX: i < activeIndex ? 1 : 0 }}
                    transition={{ ...spring, delay: 0.05 * i }}
                    // The document is RTL, so "forward" grows from the right edge.
                    style={{ originX: 1 }}
                    className="block h-full bg-st-done"
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('text-sm font-semibold', tone.fg)}>{meta.label}</p>
        {!offLadder && activeIndex < STAGE_LADDER.length - 1 && (
          <p className="truncate text-xs text-subtle">
            הבא: {stageMeta(STAGE_LADDER[activeIndex + 1]).label}
          </p>
        )}
      </div>
    </div>
  );
}
