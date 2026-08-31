import { useEffect } from 'react';
import { useToast } from '../../components/ui/Toast';

/** FCM while the tab is focused: the OS swallows the banner, so we surface a toast. */
export function ForegroundPush() {
  const { toast } = useToast();

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

  return null;
}
