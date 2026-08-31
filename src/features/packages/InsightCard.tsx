import { motion } from 'motion/react';
import { CalendarClock, CircleAlert, Hourglass, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { dayCount, formatEtaRange } from '../../lib/format';
import { enterFrom, spring, useEnterAnimation } from '../../lib/motion';
import { Skeleton } from '../../components/ui/Skeleton';
import { isTerminal, stageMeta, toneClass } from '../tracking/stages';
import type { AiInsight, HealthState, TrackedPackage } from '../tracking/types';
import { assessHealth } from '../tracking/normalize';

const HEALTH_STYLE: Record<HealthState, { label: string; className: string }> = {
  normal: { label: 'מתקדם כרגיל', className: 'bg-st-done-soft text-st-done' },
  slow: { label: 'איטי מהרגיל', className: 'bg-st-action-soft text-st-action' },
  stuck: { label: 'תקוע', className: 'bg-st-problem-soft text-st-problem' },
  problem: { label: 'דורש טיפול', className: 'bg-st-problem-soft text-st-problem' },
};

/**
 * The headline card — the first thing on the detail screen and the reason the
 * app exists. Answers "where is it, is something wrong, when will it arrive"
 * before the user has to read a single carrier scan.
 */
export function InsightCard({
  pkg,
  insight,
  generating,
}: {
  pkg: TrackedPackage;
  insight?: AiInsight;
  generating: boolean;
}) {
  const tone = toneClass(pkg.stage);
  const local = assessHealth(pkg);
  const health = insight?.health ?? { state: local.state, advice: local.advice };
  const healthStyle = HEALTH_STYLE[health.state];
  const eta = insight?.eta ?? pkg.eta;

  const meta = stageMeta(pkg.stage);
  const headline = insight?.headline ?? meta.headline;
  const meaning = insight?.meaning ?? meta.plain;
  const byAi = insight !== undefined && insight.model !== 'local';
  const animate = useEnterAnimation();

  return (
    <motion.section
      initial={enterFrom(animate, { opacity: 0, y: 10 })}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      aria-label="מה קורה עכשיו"
      className={cn('overflow-hidden rounded-card border p-4', tone.border, tone.bg)}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          {byAi && <Sparkles aria-hidden className="size-3.5 text-primary" />}
          מה קורה עכשיו
        </h2>
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', healthStyle.className)}>
          {healthStyle.label}
        </span>
      </div>

      {/* aria-live so a status change is announced without stealing focus. */}
      <div aria-live="polite">
        {generating && !insight ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <>
            <p className="font-display text-lg font-semibold leading-snug">{headline}</p>
            {meaning && <p className="mt-1.5 text-sm leading-relaxed text-muted">{meaning}</p>}
          </>
        )}
      </div>

      <dl className="mt-3.5 grid gap-2.5 border-t border-line-strong/40 pt-3 sm:grid-cols-2">
        {eta && !isTerminal(pkg.stage) && pkg.stage !== 'AWAITING_PICKUP' && (
          <div className="flex items-start gap-2">
            <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <div className="min-w-0">
              <dt className="text-xs text-subtle">צפי הגעה</dt>
              <dd className="tnum truncate text-sm font-semibold">{formatEtaRange(eta.from, eta.to)}</dd>
              {/* Confidence is stated openly: a hedged estimate the user can
                  calibrate beats a confident wrong date. */}
              <dd className="text-xs text-subtle">
                {eta.confidence === 'high' ? 'הערכה מדויקת' : eta.confidence === 'medium' ? 'הערכה סבירה' : 'הערכה גסה'}
              </dd>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2">
          <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          <div className="min-w-0">
            <dt className="text-xs text-subtle">מאז העדכון האחרון</dt>
            <dd className="text-sm font-semibold">{dayCount(local.daysSilent)}</dd>
            <dd className="text-xs text-subtle">
              טיפוסי בשלב הזה: עד {dayCount(local.typicalDaysForStage)}
            </dd>
          </div>
        </div>
      </dl>

      {health.state !== 'normal' && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-bg/40 p-3 text-sm leading-relaxed">
          <CircleAlert aria-hidden className={cn('mt-0.5 size-4 shrink-0', HEALTH_STYLE[health.state].className.split(' ')[1])} />
          {health.advice}
        </p>
      )}
    </motion.section>
  );
}
