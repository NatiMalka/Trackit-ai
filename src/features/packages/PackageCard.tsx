import { motion } from 'motion/react';
import { Link } from 'react-router';
import { ChevronLeft, Clock, Hourglass, Loader2, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { dayCount, formatEtaRange, relativeDays } from '../../lib/format';
import { listItem } from '../../lib/motion';
import { carrierInfo, defaultPackageTitle } from '../tracking/carriers';
import { assessHealth, daysUntilDeadline } from '../tracking/normalize';
import { isTerminal, needsAction, stageMeta, toneClass } from '../tracking/stages';
import { COLOR_SWATCH, type PackageColor, type TrackedPackage } from '../tracking/types';
import { PackagePhoto } from './PackagePhoto';

function HealthBadge({ pkg }: { pkg: TrackedPackage }) {
  const health = assessHealth(pkg);
  if (health.state === 'normal') return null;

  const tone =
    health.state === 'problem' || health.state === 'stuck' ? 'text-st-problem' : 'text-st-action';

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', tone)}>
      <Hourglass aria-hidden className="size-3.5" />
      {health.state === 'stuck'
        ? `תקוע ${dayCount(health.daysSilent)}`
        : health.state === 'problem'
          ? 'דורש טיפול'
          : `${dayCount(health.daysSilent)} ללא עדכון`}
    </span>
  );
}

function DeadlineBadge({ deadlineAt }: { deadlineAt?: string }) {
  const days = daysUntilDeadline(deadlineAt);
  if (days === undefined) return null;

  // The clock that stops packages being returned to sender. Loud on purpose.
  const critical = days <= 3;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold',
        critical ? 'bg-st-problem-soft text-st-problem' : 'bg-st-action-soft text-st-action',
      )}
    >
      <Clock aria-hidden className="size-3.5" />
      {days <= 0 ? 'חלף מועד האיסוף' : `נותרו ${dayCount(days)} לאיסוף`}
    </span>
  );
}

export function PackageCard({ pkg, isRefreshing }: { pkg: TrackedPackage; isRefreshing?: boolean }) {
  const meta = stageMeta(pkg.stage);
  const tone = toneClass(pkg.stage);
  const carrier = carrierInfo(pkg.carrier);
  const accent = COLOR_SWATCH[(pkg.colorTag as PackageColor) ?? 'blue'] ?? COLOR_SWATCH.blue;

  const title = pkg.nickname || pkg.itemName || defaultPackageTitle(pkg.source, pkg.trackingNumber);
  // Gemini's one-liner when we have it, the stage's own headline otherwise. The
  // sparkle is only honest for a real model: a cached fallback is written with
  // model 'local' and must not claim to be AI.
  const headline = pkg.ai?.headline ?? meta.headline;
  const byAi = pkg.ai !== undefined && pkg.ai.model !== 'local';

  return (
    <motion.li variants={listItem} layout="position">
      <Link
        to={`/p/${pkg.id}`}
        aria-label={`${title} — ${meta.label}`}
        className={cn(
          'group relative flex items-center gap-3.5 overflow-hidden rounded-card border border-line bg-surface p-4',
          'shadow-card transition-colors duration-150 hover:border-line-strong',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        )}
      >
        {/* Colour tag: the user's own way of telling packages apart at a glance. */}
        <span
          aria-hidden
          className="absolute inset-y-0 start-0 w-1"
          style={{ background: accent }}
        />

        <PackagePhoto
          src={pkg.itemImage}
          alt={title}
          stage={pkg.stage}
          maxLadderIndex={pkg.maxLadderIndex}
          layoutId={`ring-${pkg.id}`}
          live={!needsAction(pkg.stage) && pkg.stage !== 'DELIVERED'}
          className="ms-1"
        />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[0.95rem] font-semibold">{title}</h3>
            {isRefreshing && <Loader2 aria-label="מתעדכן" className="size-3.5 shrink-0 animate-spin text-subtle" />}
          </div>

          <p className="flex items-center gap-1.5 text-xs font-medium">
            <span className={tone.fg}>{meta.label}</span>
            <span aria-hidden className="text-subtle">
              ·
            </span>
            <span className="truncate text-subtle">{carrier.name}</span>
          </p>

          <p className="line-clamp-2 text-sm leading-snug text-muted">
            {byAi && <Sparkles aria-hidden className="me-1 inline size-3 align-[-0.1em] text-primary" />}
            {headline}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            <DeadlineBadge deadlineAt={pkg.deadlineAt} />
            <HealthBadge pkg={pkg} />
            {pkg.lastEventAt && (
              <time dateTime={pkg.lastEventAt} className="text-xs text-subtle">
                עודכן {relativeDays(pkg.lastEventAt)}
              </time>
            )}
            {/* The deadline badge already carries the date that matters while
                awaiting pickup, so an arrival estimate would only confuse. */}
            {pkg.eta && !isTerminal(pkg.stage) && pkg.stage !== 'AWAITING_PICKUP' && (
              <span className="tnum text-xs text-subtle">צפי: {formatEtaRange(pkg.eta.from, pkg.eta.to)}</span>
            )}
          </div>
        </div>

        {/* Points inward in RTL, i.e. "go deeper". */}
        <ChevronLeft
          aria-hidden
          className="size-5 shrink-0 text-subtle transition-transform duration-200 group-hover:-translate-x-0.5"
        />
      </Link>
    </motion.li>
  );
}
