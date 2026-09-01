import { useEffect } from 'react';
import { useToast } from '../../components/ui/Toast';
import { usePackages } from '../packages/store';

/** FCM while the tab is focused: the OS swallows the banner, so we surface a toast. */
export function ForegroundPush() {
  const { toast } = useToast();
  const { uid } = usePackages();

  useEffect(() => {
    let unsub = () => {};
    void import('./push')
      .then(({ listenForForegroundPush }) => {
        unsub = listenForForegroundPush((title, body) => {
          toast(body ? `${title} · ${body}` : title, { kind: 'info' });
        });
      })
      .catch(() => undefined);
    return () => unsub();
  }, [toast]);

  // Registration only ever ran from the Settings button, so anyone who had
  // granted permission before that flow existed - or whose token quietly
  // rotated - kept the local, in-app banner forever but never got the hourly
  // server push that fires while the app is closed. Re-running this on every
  // load (once auth has a uid to key the Firestore doc on) is what actually
  // turns "background refresh" on for those installs; getToken() is a cheap
  // no-op when the token is already current.
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!uid) return;
    void import('./push')
      .then(({ registerForPush }) => registerForPush())
      .catch(() => undefined);
  }, [uid]);

  return null;
}
