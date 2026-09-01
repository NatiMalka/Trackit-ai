import { NavLink, Outlet, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { Package, Plus, Settings } from 'lucide-react';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { usePackages } from '../../features/packages/store';
import { PwaBanners } from './PwaBanners';

const NAV = [
  { to: '/', label: 'החבילות שלי', icon: Package },
  { to: '/add', label: 'הוספה', icon: Plus },
  { to: '/settings', label: 'הגדרות', icon: Settings },
] as const;

function NavItems({
  orientation,
  unreadCount,
}: {
  orientation: 'bar' | 'rail';
  unreadCount: number;
}) {
  const { pathname } = useLocation();

  return (
    <>
      {NAV.map(({ to, label, icon: Icon }) => {
        // Package detail routes belong to the list tab.
        const active = to === '/' ? pathname === '/' || pathname.startsWith('/p/') : pathname === to;
        return (
          <NavLink
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            aria-label={
              to === '/' && unreadCount > 0 ? `${label}, ${unreadCount} עדכונים חדשים` : undefined
            }
            className={cn(
              'relative flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-150',
              orientation === 'bar' ? 'h-full flex-1 flex-col gap-1 text-[0.7rem]' : 'w-full px-3 py-3 text-sm',
              active ? 'text-primary' : 'text-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={`nav-indicator-${orientation}`}
                transition={spring}
                aria-hidden
                className={cn(
                  'absolute bg-primary-soft',
                  orientation === 'bar'
                    ? 'inset-x-3 inset-y-1.5 rounded-xl'
                    : 'inset-0 rounded-xl',
                )}
              />
            )}
            <span className="relative">
              <Icon
                aria-hidden
                strokeWidth={active ? 2.2 : 1.75}
                className={cn('relative shrink-0', orientation === 'bar' ? 'size-5' : 'size-5')}
              />
              {to === '/' && unreadCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -end-1 -top-0.5 size-2 rounded-full bg-primary"
                />
              )}
            </span>
            {/* Icon plus label always: icon-only nav hurts discoverability. */}
            <span className="relative">{label}</span>
          </NavLink>
        );
      })}
    </>
  );
}

export function AppShell() {
  const { packages } = usePackages();
  const unreadCount = packages.filter((p) => p.unread).length;

  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar from 1024px, bottom bar below. */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 border-e border-line bg-surface p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2 pt-2">
          <img src="/icons/apple-touch-192.png" alt="" aria-hidden className="size-9 rounded-xl" />
          <div className="leading-tight">
            <p className="font-display text-base font-semibold">TrackIt AI</p>
            <p className="text-xs text-subtle">מעקב חבילות חכם</p>
          </div>
        </div>
        <nav aria-label="ניווט ראשי" className="flex flex-col gap-1">
          <NavItems orientation="rail" unreadCount={unreadCount} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          id="main"
          className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(var(--ti-nav-h)+2rem)] pt-4 safe-t lg:pb-10 lg:pt-8"
        >
          <PwaBanners />
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="ניווט ראשי"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-lg safe-b lg:hidden"
      >
        <div className="mx-auto flex h-[var(--ti-nav-h)] max-w-md items-stretch px-2">
          <NavItems orientation="bar" unreadCount={unreadCount} />
        </div>
      </nav>
    </div>
  );
}
