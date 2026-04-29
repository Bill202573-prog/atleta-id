import { useEffect, useRef } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/contexts/AuthContext';

const getPromptedKey = (userId: string) => `atleta_id_push_prompted:${userId}`;

/**
 * Invisible component that auto-subscribes the user to push notifications.
 *
 * - Guardians (responsáveis): never prompts. If permission is already 'granted',
 *   the subscription is registered silently. Otherwise nothing happens.
 * - School admins (role === 'school'): the first time they open the panel after
 *   this feature ships, the native permission popup is requested ONCE
 *   (controlled by a localStorage flag). If they accept, push is subscribed
 *   silently from then on. If they deny, we never ask again.
 */
export function PushAutoSubscribe() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, isOptedOut, isLoading, subscribe } = usePushNotifications();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isSupported || isSubscribed || isOptedOut || isLoading || attempted.current) return;
    if (!user?.id) return;
    attempted.current = true;

    const permission = Notification.permission;

    if (permission === 'granted') {
      // Already granted at OS/browser level — keep push configured silently.
      subscribe().catch(() => {});
      return;
    }

    if (permission === 'denied') return;

    // permission === 'default' → only school admins get an automatic one-shot prompt.
    if (user.role !== 'school') return;

    const promptedKey = getPromptedKey(user.id);
    if (localStorage.getItem(promptedKey) === 'true') return;

    localStorage.setItem(promptedKey, 'true');
    // subscribe() internally calls Notification.requestPermission().
    subscribe().catch(() => {});
  }, [isSupported, isSubscribed, isOptedOut, isLoading, subscribe, user?.id, user?.role]);

  return null;
}
