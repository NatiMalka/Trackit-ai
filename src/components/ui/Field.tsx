import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface BaseProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}

const shell =
  'w-full rounded-xl border bg-surface px-3.5 py-3 text-fg placeholder:text-subtle ' +
  'transition-colors duration-150 focus:outline-none focus-visible:border-primary';

function Shell({
  label,
  hint,
  error,
  required,
  id,
  className,
  children,
}: BaseProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
        {required && (
          <span aria-hidden className="text-st-problem">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {/* Helper text stays visible; it is not a placeholder substitute. */}
      {hint && !error && <p className="text-xs leading-relaxed text-subtle">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-st-problem">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps extends BaseProps, Omit<React.ComponentPropsWithoutRef<'input'>, 'className'> {}

export function TextField({ label, hint, error, required, className, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(shell, 'min-h-12', error ? 'border-st-problem' : 'border-line')}
        {...rest}
      />
    </Shell>
  );
}

export interface TextAreaFieldProps extends BaseProps, Omit<React.ComponentPropsWithoutRef<'textarea'>, 'className'> {}

export function TextAreaField({ label, hint, error, required, className, ...rest }: TextAreaFieldProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(shell, 'resize-y leading-relaxed', error ? 'border-st-problem' : 'border-line')}
        {...rest}
      />
    </Shell>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[0.95rem] font-medium">
          {label}
        </label>
        {description && <p className="text-xs leading-relaxed text-subtle">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-primary' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-1 size-5 rounded-full bg-white transition-[inset-inline-start] duration-200',
            checked ? 'start-6' : 'start-1',
          )}
        />
      </button>
    </div>
  );
}
