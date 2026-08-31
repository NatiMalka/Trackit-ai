import { Suspense, lazy, useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from '../components/layout/AppShell';
import { PackageCardSkeleton } from '../components/ui/Skeleton';
import { ToastProvider } from '../components/ui/Toast';
import { PackagesProvider } from '../features/packages/store';
import { ForegroundPush } from '../features/notifications/ForegroundPush';
import { PackagesPage } from './routes/PackagesPage';

// The list is the entry point for almost every session, so it ships in the main
// chunk. Everything else is split, which keeps first paint small on mobile data.
const importDetail = () => import('./routes/PackageDetailPage');
const PackageDetailPage = lazy(() => importDetail().then((m) => ({ default: m.PackageDetailPage })));
const AddPackagePage = lazy(() => import('./routes/AddPackagePage').then((m) => ({ default: m.AddPackagePage })));
const SettingsPage = lazy(() => import('./routes/SettingsPage').then((m) => ({ default: m.SettingsPage })));

/**
 * Pull the detail chunk in while the user reads the list.
 *
 * Without this the first tap hits a Suspense fallback, which unmounts the card
 * before the detail header exists — and the shared-element ring morph silently
 * degrades into a page swap exactly once per session.
 */
function usePrefetchDetail() {
  useEffect(() => {
    const idle = window.requestIdleCallback?.bind(window);
    if (idle) {
      const handle = idle(() => void importDetail(), { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => void importDetail(), 1200);
    return () => window.clearTimeout(timer);
  }, []);
}

function RouteFallback() {
  return (
    <div className="space-y-3 pt-4">
      <PackageCardSkeleton />
      <PackageCardSkeleton />
    </div>
  );
}

export function App() {
  usePrefetchDetail();

  return (
    <BrowserRouter>
      {/* One global gate for prefers-reduced-motion: every motion component in
          the app drops transforms and keeps only opacity when the user asks. */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <PackagesProvider>
            <ForegroundPush />
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[80] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
            >
              דלג לתוכן הראשי
            </a>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<PackagesPage />} />
                <Route
                  path="p/:id"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <PackageDetailPage />
                    </Suspense>
                  }
                />
                <Route
                  path="add"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <AddPackagePage />
                    </Suspense>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <Suspense fallback={<RouteFallback />}>
                      <SettingsPage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </PackagesProvider>
        </ToastProvider>
      </MotionConfig>
    </BrowserRouter>
  );
}
