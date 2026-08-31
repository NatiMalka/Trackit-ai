import { cn } from '../../lib/cn';

export function Card({ className, children, ...rest }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('surface-card p-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: React.ComponentPropsWithoutRef<'h3'>) {
  return (
    <h3 className={cn('text-sm font-semibold text-muted', className)} {...rest}>
      {children}
    </h3>
  );
}
