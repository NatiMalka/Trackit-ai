import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { spring, tweenOut } from '../../lib/motion';
import { IconButton } from './Button';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Sheets that own their scrolling (like chat) opt out of the default padding. */
  bare?: boolean;
  className?: string;
}

/**
 * Bottom sheet on mobile, centred dialog from ~640px up.
 * The scrim carries the blur, which signals "tap outside to dismiss".
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children, bare, className }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  // Read through a ref so the effect below depends on `open` alone. Callers pass
  // inline closures, and re-running on every parent render would yank focus back
  // to the panel while the user is typing in it.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onClose = () => closeRef.current();

    // aria-modal only promises the dialog is modal; keeping focus inside it is
    // still our job, as is handing focus back to whatever opened the sheet.
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;

      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: tweenOut }}
            onClick={onClose}
            aria-hidden
            className="absolute inset-0 bg-[var(--ti-scrim)] backdrop-blur-sm"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0, transition: tweenOut }}
            transition={spring}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className={cn(
              'relative flex max-h-[88dvh] w-full flex-col overflow-hidden bg-overlay',
              'rounded-t-3xl border-t border-line shadow-sheet',
              'sm:max-w-lg sm:rounded-3xl sm:border',
              className,
            )}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-3">
                <div aria-hidden className="h-1 w-9 rounded-full bg-line-strong sm:hidden" />
                <h2 id={titleId} className="text-base font-semibold">
                  {title}
                </h2>
              </div>
              <IconButton label="סגור" onClick={onClose}>
                <X className="size-5" />
              </IconButton>
            </header>
            <div className={cn('min-h-0 flex-1 overflow-y-auto', !bare && 'p-4 safe-b')}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
