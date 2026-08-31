import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PREFS, PREFS_VERSION, type NotificationPrefs } from './rules';

export { DEFAULT_PREFS, type NotificationPrefs };

const KEY = 'trackit.notificationPrefs';

function migrate(raw: NotificationPrefs): NotificationPrefs {
  // v2: every status change notifies. Older installs stored milestonesOnly: true
  // as the then-default, not as a deliberate quiet-mode choice.
  if ((raw.prefsVersion ?? 0) < 2) {
    return { ...DEFAULT_PREFS, ...raw, milestonesOnly: false, prefsVersion: PREFS_VERSION };
  }
  return { ...DEFAULT_PREFS, ...raw };
}

function read(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw) as NotificationPrefs) : DEFAULT_PREFS;
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
    void import('./push').then((m) => m.syncPrefsToServer()).catch(() => undefined);
  }, [prefs]);

  const setPref = useCallback(<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
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
