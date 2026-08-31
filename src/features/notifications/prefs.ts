import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PREFS, type NotificationPrefs } from './rules';

export { DEFAULT_PREFS, type NotificationPrefs };

const KEY = 'trackit.notificationPrefs';

function read(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as NotificationPrefs) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function write(prefs: NotificationPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

export function loadPrefs() {
  return read();
}

type Permission = NotificationPermission | 'unsupported';

function currentPermission(): Permission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(read);
  const [permission, setPermission] = useState<Permission>(currentPermission);

  useEffect(() => {
    write(prefs);
  }, [prefs]);

  const setPref = useCallback(<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      // Registering for push is Phase 3 and needs the Blaze plan, so it is
      // imported lazily and its absence must not break the settings screen.
      try {
        const { registerForPush } = await import('./push');
        const token = await registerForPush();
        if (token) setPrefs((prev) => ({ ...prev, token }));
      } catch (err) {
        console.warn('[trackit] push registration unavailable', err);
      }
    }
  }, []);

  return { prefs, setPref, permission, requestPermission };
}
