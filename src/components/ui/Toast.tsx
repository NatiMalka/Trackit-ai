import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Undo2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { spring, tweenOut } from '../../lib/motion';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  undo?: () => void;
}

interface ToastApi {
  toast: (message: string, opts?: { kind?: ToastKind; undo?: () => void }) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const accents: Record<ToastKind, string> = {
  success: 'text-st-done',
  error: 'text-st-problem',
  info: 'text-primary',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    (message, opts) => {
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-2), { id, kind: opts?.kind ?? 'info', message, undo: opts?.undo }]);
      // Undo needs longer to be actionable than a plain confirmation.
      window.setTimeout(() => dismiss(id), opts?.undo ? 6000 : 3600);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* polite + no focus steal, per WCAG guidance for status messages */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--ti-nav-h)+1rem)] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = icons[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: tweenOut }}
                transition={spring}
                className={cn(
                  'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl',
                  'border border-line bg-overlay px-4 py-3 shadow-sheet',
                )}
              >
                <Icon aria-hidden className={cn('size-5 shrink-0', accents[t.kind])} />
                <p className="min-w-0 flex-1 text-sm">{t.message}</p>
                {t.undo && (
                  <button
                    type="button"
                    onClick={() => {
                      t.undo?.();
                      dismiss(t.id);
                    }}
                    className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary"
                  >
                    <Undo2 aria-hidden className="size-4" />
                    בטל
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
