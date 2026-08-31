import { cn } from '../../lib/cn';
import { countryCode } from '../tracking/normalize';

/** Country marker for timeline legs and the route arc. */
export function CountryBadge({ code, className }: { code?: string; className?: string }) {
  const label = countryCode(code);
  if (!label) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'ltr tnum inline-grid h-5 min-w-7 place-items-center rounded border border-line-strong',
        'bg-elevated px-1 text-[0.65rem] font-bold leading-none tracking-wide text-muted',
        className,
      )}
    >
      {label}
    </span>
  );
}
