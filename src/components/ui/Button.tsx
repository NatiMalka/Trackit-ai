import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet-danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  accent: 'bg-accent text-white hover:brightness-110',
  secondary: 'bg-elevated text-fg border border-line hover:border-line-strong',
  ghost: 'text-muted hover:text-fg hover:bg-primary-soft',
  danger: 'bg-st-problem-soft text-st-problem border border-st-problem/30 hover:bg-st-problem/20',
  // Destructive but not shouting: reads as a normal control until hovered, so
  // it does not become the most prominent thing on a screen.
  'quiet-danger': 'text-muted hover:bg-st-problem-soft hover:text-st-problem',
};

const sizes: Record<Size, string> = {
  sm: 'h-11 px-3.5 text-sm gap-1.5',
  md: 'h-12 px-5 text-[0.95rem] gap-2',
  lg: 'h-14 px-6 text-base gap-2.5',
};

/** Shared recipe, so a link that looks like a button cannot drift from one. */
function buttonClass(variant: Variant, size: Size, block?: boolean, className?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-xl font-medium select-none',
    'transition-colors duration-150',
    'disabled:opacity-45 disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  );
}

// Extends the motion props rather than React's: motion redefines the drag and
// pan handlers, and mixing the two signatures does not typecheck. `children` is
// narrowed back to ReactNode since a MotionValue makes no sense in a label.
export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  block,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={spring}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, block, className)}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-[1.15em] animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

/**
 * A navigation control that looks like a button.
 *
 * Exists so we never wrap a `<Button>` in a `<Link>`: a `<button>` inside an
 * `<a>` is invalid HTML, gives keyboard users two stops for one control, and
 * makes screen readers announce it twice.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, block, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  label: string;
  variant?: Variant;
  children?: ReactNode;
}

/** Icon-only control. `label` is required so it can never ship unlabelled. */
export function IconButton({ label, variant = 'ghost', className, children, ...rest }: IconButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={spring}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid place-items-center rounded-xl tap transition-colors duration-150',
        'disabled:opacity-45 disabled:pointer-events-none',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
