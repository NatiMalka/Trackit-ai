import { cn } from '../../lib/cn';

/** Shimmer placeholder. Always sized to the real content so nothing shifts on load. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-lg bg-elevated',
        'after:absolute after:inset-0 after:animate-[ti-shimmer_1.4s_ease-in-out_infinite]',
        'after:bg-gradient-to-l after:from-transparent after:via-white/6 after:to-transparent',
        className,
      )}
    />
  );
}

export function PackageCardSkeleton() {
  return (
    <div className="surface-card flex items-center gap-4 p-4">
      <Skeleton className="size-14 shrink-0 rounded-2xl" />
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}
