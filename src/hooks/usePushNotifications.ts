import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Extend ServiceWorkerRegistration to include pushManager
declare global {
  interface ServiceWorkerRegistration {
    pushManager: PushManager;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function uint8ArrayToUrlBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeBase64Url(value: string): string {
  return value.replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function bufferSourceToUrlBase64(source?: BufferSource | null): string | null {
  if (!source) return null;

  const view = source instanceof ArrayBuffer
    ? new Uint8Array(source)
    : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);

  return uint8ArrayToUrlBase64(view);
}

export function usePushNotifications() {
  const { session } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  const getPushRegistration = async (): Promise<ServiceWorkerRegistration> => {
    // Register dedicated push SW with a unique scope to avoid conflicts with Workbox SW
    const registrations = await navigator.serviceWorker.getRegistrations();
    const existing = registrations.find(r => r.active?.scriptURL?.includes('push-sw.js'));
    if (existing) return existing;
    return navigator.serviceWorker.register('/push-sw.js', { scope: '/push-handler' });
  };

  const fetchVapidPublicKey = useCallback(async (): Promise<string> => {
    if (vapidPublicKey) return vapidPublicKey;

    const { data, error } = await supabase.functions.invoke('push-vapid-public-key', {
      method: 'GET',
    });

    if (error) throw error;

    const key = (data as { vapidPublicKey?: string } | null)?.vapidPublicKey;
    if (!key) throw new Error('VAPID public key not found');

    setVapidPublicKey(key);
    return key;
  }, [vapidPublicKey]);

  const syncSubscriptionInDatabase = useCallback(async (subscription: PushSubscription) => {
    if (!session?.user?.id) return;

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: session.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      }, {
        onConflict: 'user_id,endpoint',
      });

    if (error) {
      console.error('Push sync error:', error);
    }
  }, [session?.user?.id]);

  const checkExistingSubscription = useCallback(async () => {
    try {
      const reg = await getPushRegistration();
      await navigator.serviceWorker.ready;

      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return;
      }

      const currentVapidKey = await fetchVapidPublicKey();
      const subscriptionServerKey = bufferSourceToUrlBase64(subscription.options.applicationServerKey);

      // If the browser subscription was created with a different VAPID key,
      // force re-subscription so server and client keys match.
      if (
        subscriptionServerKey &&
        normalizeBase64Url(subscriptionServerKey) !== normalizeBase64Url(currentVapidKey)
      ) {
        await subscription.unsubscribe();
        setIsSubscribed(false);
        return;
      }

      await syncSubscriptionInDatabase(subscription);
      setIsSubscribed(true);
    } catch (err) {
      console.error('Push subscription check error:', err);
      setIsSubscribed(false);
    }
  }, [fetchVapidPublicKey, syncSubscriptionInDatabase]);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      checkExistingSubscription();
    }
  }, [checkExistingSubscription, session?.user?.id]);

  const subscribe = useCallback(async () => {
    if (!session?.user?.id || !isSupported) return false;

    setIsLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        return false;
      }

      const currentVapidKey = await fetchVapidPublicKey();
      const registration = await getPushRegistration();

      // Wait for SW to become active
      if (!registration.active) {
        await new Promise<void>((resolve) => {
          const sw = registration.installing || registration.waiting;
          if (sw) {
            sw.addEventListener('statechange', () => {
              if (sw.state === 'activated') resolve();
            });
          } else {
            resolve();
          }
        });
      }

      // Unsubscribe existing if any
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(currentVapidKey) as BufferSource,
      });

      await syncSubscriptionInDatabase(subscription);
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Push subscription error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, isSupported, fetchVapidPublicKey, syncSubscriptionInDatabase]);

  const unsubscribe = useCallback(async () => {
    if (!session?.user?.id) return;

    setIsLoading(true);
    try {
      const registration = await getPushRegistration();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', session.user.id)
          .eq('endpoint', subscription.endpoint);
      }

      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
