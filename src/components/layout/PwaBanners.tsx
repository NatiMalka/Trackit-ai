import { AnimatePresence, motion } from 'motion/react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { useInstallPrompt, useOnlineStatus, useServiceWorker } from '../../lib/pwa';
import { spring, tweenOut } from '../../lib/motion';
import { Button, IconButton } from '../ui/Button';

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, transition: tweenOut }}
      transition={spring}
      className="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-elevated px-4 py-3 shadow-card"
    >
      {children}
    </motion.div>
  );
}

/** Offline notice, update gate and install nudge. Stacked, never more than one visible per concern. */
export function PwaBanners() {
  const online = useOnlineStatus();
  const { updateReady, applyUpdate } = useServiceWorker();
  const { canInstall, install, dismiss } = useInstallPrompt();

  return (
    // In flow rather than fixed: an overlaid banner covers the page heading,
    // and these are transient enough not to need to follow the scroll.
    <div className="flex flex-col gap-2 empty:hidden">
      <AnimatePresence initial={false}>
        {!online && (
          <div key="offline">
            <Banner>
              <WifiOff aria-hidden className="size-5 shrink-0 text-st-action" />
              <p className="flex-1 text-sm">
                אין חיבור לאינטרנט — מוצגים הנתונים השמורים
              </p>
            </Banner>
          </div>
        )}

        {updateReady && (
          <div key="update">
            <Banner>
              <RefreshCw aria-hidden className="size-5 shrink-0 text-primary" />
              <p className="flex-1 text-sm">גרסה חדשה מוכנה</p>
              <Button size="sm" onClick={applyUpdate}>
                רענן
              </Button>
            </Banner>
          </div>
        )}

        {canInstall && online && (
          <div key="install">
            <Banner>
              <Download aria-hidden className="size-5 shrink-0 text-primary" />
              <p className="flex-1 text-sm leading-snug">
                התקן את TrackIt AI לגישה מהירה גם בלי דפדפן
              </p>
              <Button size="sm" onClick={install}>
                התקן
              </Button>
              <IconButton label="לא עכשיו" onClick={dismiss} className="size-9 min-h-9 min-w-9">
                <X className="size-4" />
              </IconButton>
            </Banner>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
