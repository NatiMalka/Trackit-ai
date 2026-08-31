import { motion } from 'motion/react';
import { CalendarClock, PackageOpen } from 'lucide-react';
import { Link } from 'react-router';
import { daysBetween, packageCount } from '../../lib/format';
import { enterFrom, tween, useEnterAnimation } from '../../lib/motion';
import { needsAction, stageMeta } from '../tracking/stages';
import type { TrackedPackage } from '../tracking/types';
import { defaultPackageTitle } from '../tracking/carriers';

/**
 * The answer to "what should I care about today", above everything else.
 *
 * Counts packages whose ETA window opens within a week, and separately anything
 * waiting on the user, because those two need different reactions.
 */
export function ArrivingSoon({ packages }: { packages: TrackedPackage[] }) {
  const animate = useEnterAnimation();
  const active = packages.filter((p) => !p.archived && p.stage !== 'DELIVERED' && p.stage !== 'RETURNED');
  if (active.length === 0) return null;

  const soon = active.filter((p) => p.eta && daysBetween(Date.now(), p.eta.from) <= 7);
  const actionable = active.filter((p) => needsAction(p.stage));

  // Verb agreement follows the count, so the singular case reads naturally
  // rather than as a template with a number dropped into it.
  const headline =
    actionable.length > 0
      ? `${packageCount(actionable.length)} ${actionable.length === 1 ? 'דורשת' : 'דורשות'} טיפול`
      : soon.length > 0
        ? `${packageCount(soon.length)} ${soon.length === 1 ? 'צפויה' : 'צפויות'} להגיע בשבוע הקרוב`
        : `${packageCount(active.length)} בדרך`;

  const spotlight = actionable[0] ?? soon[0];

  return (
    <motion.section
      initial={enterFrom(animate, { opacity: 0, y: 10 })}
      animate={{ opacity: 1, y: 0 }}
      transition={tween}
      aria-label="סקירה"
      className="mb-4 overflow-hidden rounded-card border border-line bg-gradient-to-bl from-primary-soft to-transparent p-4"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary-soft text-primary">
          {spotlight?.itemImage ? (
            <img
              src={spotlight.itemImage}
              alt=""
              decoding="async"
              className="size-full object-cover"
            />
          ) : actionable.length > 0 ? (
            <PackageOpen aria-hidden strokeWidth={1.75} className="size-5" />
          ) : (
            <CalendarClock aria-hidden strokeWidth={1.75} className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold leading-snug">{headline}</h2>
          {spotlight && (
            <Link
              to={`/p/${spotlight.id}`}
              className="mt-0.5 block truncate text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
            >
              {spotlight.nickname ||
                spotlight.itemName ||
                defaultPackageTitle(spotlight.source, spotlight.trackingNumber)}{' '}
              —{' '}
              {spotlight.ai?.headline ?? stageMeta(spotlight.stage).headline}
            </Link>
          )}
        </div>
      </div>
    </motion.section>
  );
}
