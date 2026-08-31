import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';

export interface ChipProps {
  active?: boolean;
  count?: number;
  icon?: ReactNode;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

/** Filter pill. The active one gets a sliding indicator via layoutId from the parent group. */
export function Chip({ active, count, icon, onClick, children, className }: ChipProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      transition={spring}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2.5 text-sm font-medium',
        'border transition-colors duration-150',
        active
          ? 'border-primary/50 bg-primary-soft text-fg'
          : 'border-line bg-surface text-muted hover:text-fg hover:border-line-strong',
        className,
      )}
    >
      {icon}
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            'tnum rounded-full px-1.5 text-xs font-semibold',
            active ? 'bg-primary text-on-primary' : 'bg-elevated text-subtle',
          )}
        >
          {count}
        </span>
      )}
    </motion.button>
  );
}

/** Small non-interactive label, e.g. carrier name or source marketplace. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-0.5 text-xs font-medium text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}
