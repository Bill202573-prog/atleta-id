import { useEffect, useRef } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Invisible component that auto-subscribes the guardian to push notifications.
 * No UI is rendered — subscription happens silently on mount.
 * If the user has denied permission at browser level, nothing happens.
 */
export function PushAutoSubscribe() {
  const { isSupported, isSubscribed, isOptedOut, isLoading, subscribe } = usePushNotifications();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isSupported || isSubscribed || isOptedOut || isLoading || attempted.current) return;
    attempted.current = true;

    // Browsers do not allow truly invisible first-time permission grants.
    // If permission was already granted, keep push configured silently.
    if (Notification.permission === 'granted') {
      subscribe().catch(() => {});
    }
  }, [isSupported, isSubscribed, isOptedOut, isLoading, subscribe]);

  return null;
}
