import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { enterFrom, spring, useEnterAnimation } from '../../lib/motion';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const enter = useEnterAnimation();

  return (
    <motion.div
      initial={enterFrom(enter, { opacity: 0, y: 12 })}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex flex-col items-center gap-4 px-6 py-14 text-center"
    >
      <div className="grid size-20 place-items-center rounded-3xl bg-primary-soft text-primary">{icon}</div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mx-auto max-w-[34ch] text-sm leading-relaxed text-muted">{body}</p>
      </div>
      {action}
    </motion.div>
  );
}
