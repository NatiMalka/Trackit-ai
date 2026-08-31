import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'trackit.installDismissedAt';
const DISMISS_MS = 1000 * 60 * 60 * 24 * 14;

/**
 * Service-worker registration with a manual update gate. `registerType` is
 * 'prompt', so a new build never reloads the page out from under a user who is
 * mid-way through adding a package.
 */
export function useServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateReady(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
    });
    setApplyUpdate(() => () => void update(true));
  }, []);

  return {
    updateReady,
    offlineReady,
    dismissOfflineReady: useCallback(() => setOfflineReady(false), []),
    applyUpdate: useCallback(() => applyUpdate?.(), [applyUpdate]),
  };
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const recentlyDismissed = () => {
      try {
        const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
        return Date.now() - at < DISMISS_MS;
      } catch {
        return false;
      }
    };

    const onPrompt = (e: Event) => {
      // Suppress Chrome's own mini-infobar; we surface it in-app instead, at a
      // moment when the user has already seen the app do something useful.
      e.preventDefault();
      if (!recentlyDismissed()) setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvent(null);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  }, [event]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode */
    }
    setEvent(null);
  }, []);

  return { canInstall: event !== null, install, dismiss };
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}
