import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, PackagePlus, PackageSearch, RefreshCw } from 'lucide-react';
import { ButtonLink, IconButton } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { PackageCardSkeleton } from '../../components/ui/Skeleton';
import { PageHeader } from '../../components/layout/PageHeader';
import { listContainer, useEnterAnimation } from '../../lib/motion';
import { packageCount } from '../../lib/format';
import { ArrivingSoon } from '../../features/packages/ArrivingSoon';
import { PackageCard } from '../../features/packages/PackageCard';
import { PullToRefresh } from '../../features/packages/PullToRefresh';
import { usePackages } from '../../features/packages/store';
import { needsAction } from '../../features/tracking/stages';
import type { TrackedPackage } from '../../features/tracking/types';

type Filter = 'all' | 'transit' | 'action' | 'done';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'הכל' },
  { id: 'transit', label: 'בדרך' },
  { id: 'action', label: 'דורש טיפול' },
  { id: 'done', label: 'נמסרו' },
];

function matches(pkg: TrackedPackage, filter: Filter) {
  switch (filter) {
    case 'transit':
      return pkg.stage !== 'DELIVERED' && pkg.stage !== 'RETURNED' && !needsAction(pkg.stage);
    case 'action':
      return needsAction(pkg.stage);
    case 'done':
      return pkg.stage === 'DELIVERED' || pkg.stage === 'RETURNED';
    default:
      return true;
  }
}

export function PackagesPage() {
  const { packages, loading, error, refreshing, refreshAll } = usePackages();
  const [filter, setFilter] = useState<Filter>('all');
  const [manualRefresh, setManualRefresh] = useState(false);
  const enter = useEnterAnimation();

  const counts = useMemo(
    () =>
      FILTERS.reduce<Record<Filter, number>>(
        (acc, f) => {
          acc[f.id] = packages.filter((p) => matches(p, f.id)).length;
          return acc;
        },
        { all: 0, transit: 0, action: 0, done: 0 },
      ),
    [packages],
  );

  const visible = useMemo(() => packages.filter((p) => matches(p, filter)), [packages, filter]);

  // Only true after a refresh the user asked for, so the live region stays
  // silent on first load — where the heading already says the same thing.
  const [announced, setAnnounced] = useState(false);

  const handleRefresh = async () => {
    setManualRefresh(true);
    setAnnounced(false);
    try {
      await refreshAll();
    } finally {
      setManualRefresh(false);
      setAnnounced(true);
    }
  };

  return (
    <>
      <PageHeader
        title="החבילות שלי"
        subtitle={packages.length > 0 ? `${packageCount(packages.length)} במעקב` : 'עדיין לא הוספת חבילות'}
        action={
          <div className="flex items-center gap-1.5">
            <IconButton
              label="רענן את כל החבילות"
              onClick={handleRefresh}
              disabled={manualRefresh || packages.length === 0}
            >
              <RefreshCw className={manualRefresh ? 'size-5 animate-spin' : 'size-5'} />
            </IconButton>
            <ButtonLink to="/add" size="sm" icon={<PackagePlus className="size-4" />} className="hidden lg:inline-flex">
              הוסף חבילה
            </ButtonLink>
          </div>
        }
      />

      {/* Refreshing is otherwise conveyed only by a spinning icon, which says
          nothing to a screen reader. Polite so it never interrupts. */}
      <p aria-live="polite" className="sr-only">
        {manualRefresh
          ? 'מרענן את החבילות'
          : announced
            ? `הרשימה עודכנה. ${packageCount(packages.length)} במעקב`
            : ''}
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-card border border-st-problem/30 bg-st-problem-soft p-4"
        >
          <AlertCircle aria-hidden className="size-5 shrink-0 text-st-problem" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <PackageCardSkeleton />
          <PackageCardSkeleton />
          <PackageCardSkeleton />
        </div>
      ) : packages.length === 0 ? (
        <EmptyState
          icon={<PackageSearch aria-hidden strokeWidth={1.5} className="size-9" />}
          title="בוא נתחיל לעקוב"
          body="הדבק מספר מעקב, או אפילו את כל המייל מהמוכר — נזהה בעצמנו את מספר המעקב ואת השליח, ונסביר בעברית פשוטה מה קורה עם החבילה."
          action={
            <ButtonLink to="/add" size="lg" icon={<PackagePlus className="size-5" />}>
              הוספת חבילה ראשונה
            </ButtonLink>
          }
        />
      ) : (
        <>
          <ArrivingSoon packages={packages} />

          <div
            role="tablist"
            aria-label="סינון חבילות"
            className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1"
          >
            {FILTERS.map((f) => (
              <Chip key={f.id} active={filter === f.id} count={counts[f.id]} onClick={() => setFilter(f.id)}>
                {f.label}
              </Chip>
            ))}
          </div>

          <PullToRefresh onRefresh={refreshAll}>
            {/* `initial` off when the tab is hidden: the stagger would otherwise
                freeze at opacity 0 until the user came back to the app. */}
            <AnimatePresence mode="wait" initial={enter}>
              {visible.length === 0 ? (
                <motion.p
                  key={`empty-${filter}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-12 text-center text-sm text-muted"
                >
                  אין חבילות בקטגוריה הזו
                </motion.p>
              ) : (
                <motion.ul
                  key={filter}
                  variants={listContainer}
                  initial="hidden"
                  animate="show"
                  className="space-y-3"
                >
                  {visible.map((pkg) => (
                    <PackageCard key={pkg.id} pkg={pkg} isRefreshing={refreshing.has(pkg.id)} />
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </PullToRefresh>
        </>
      )}

      {/* Mobile FAB. The list already has a primary action on desktop. */}
      <Link
        to="/add"
        aria-label="הוסף חבילה"
        className="fixed bottom-[calc(var(--ti-nav-h)+1rem)] end-4 z-30 grid size-14 place-items-center rounded-2xl bg-primary text-on-primary shadow-sheet transition-transform duration-150 active:scale-95 lg:hidden"
      >
        <PackagePlus aria-hidden className="size-6" />
      </Link>
    </>
  );
}
