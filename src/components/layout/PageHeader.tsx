import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { enterFrom, tween, useEnterAnimation } from '../../lib/motion';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  const enter = useEnterAnimation();

  return (
    <motion.header
      initial={enterFrom(enter, { opacity: 0, y: -8 })}
      animate={{ opacity: 1, y: 0 }}
      transition={tween}
      className="mb-5 flex items-start justify-between gap-3"
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </motion.header>
  );
}
