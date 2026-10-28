import {
  type NotificationSettings,
  notificationSettingsBodySchema,
  pushDisabledSchema,
  pushSubscriptionInputSchema,
  pushTestResponseSchema,
  vapidKeyResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ApiError, apiFetch, JSON_HEADERS } from '../../api/client';
import { useActingUser } from '../../app/acting-user';
import { readDeviceMode } from '../../app/device-mode';
import { logger } from '../../logger';

/**
 * Известията (GLOSSARY: Известие) на това устройство: `unsupported` — браузърът няма Web Push; `disabled` — api-то е
 * без VAPID ключове (`push_disabled`); `denied` — човекът е отказал в браузъра; `off`/`on` — без или с абонамент.
 */
export type PushDevice =
  | { status: 'unsupported' }
  | { status: 'disabled' }
  | { status: 'denied' }
  | { status: 'off'; publicKey: string }
  | { status: 'on'; publicKey: string; subscription: PushSubscription };

export const pushKeys = {
  device: ['push-device'] as const,
  settings: (actingUserId: string | null) =>
    ['notification-settings', actingUserId] as const,
};

/** Web Push изисква service worker, `PushManager` и `Notification`; iOS извън инсталирано PWA няма нито едно. */
export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function isPushDisabled(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    pushDisabledSchema.safeParse(error.body).success
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function readPushDevice(): Promise<PushDevice> {
  if (!pushSupported()) {
    return { status: 'unsupported' };
  }
  let publicKey: string;
  try {
    ({ publicKey } = await apiFetch(
      '/notifications/vapid-key',
      vapidKeyResponseSchema,
    ));
  } catch (error) {
    if (isPushDisabled(error)) {
      return { status: 'disabled' };
    }
    throw error;
  }
  if (Notification.permission === 'denied') {
    return { status: 'denied' };
  }
  const subscription = await currentSubscription();
  return subscription
    ? { status: 'on', publicKey, subscription }
    : { status: 'off', publicKey };
}

/** `PUT /api/notifications/subscription`: устройството е на действащия потребител (и се мести към него). */
function putSubscription(subscription: PushSubscription) {
  return apiFetch(
    '/notifications/subscription',
    { parse: () => undefined },
    {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(
        pushSubscriptionInputSchema.parse(subscription.toJSON()),
      ),
    },
  );
}

/** Състоянието на известията на устройството; не зависи от действащия потребител. */
export function usePushDevice() {
  return useQuery({
    queryKey: pushKeys.device,
    queryFn: readPushDevice,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * „Включи известия на това устройство“: разрешение от браузъра, абонамент с ключа на api-то и `PUT`. Отказ или
 * затворен въпрос не е грешка — устройството остава без абонамент. Ако api-то не приеме абонамента, той се маха и от
 * браузъра, за да не останат двете различни.
 */
export function useEnablePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (publicKey: string) => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      try {
        await putSubscription(subscription);
      } catch (error) {
        await subscription.unsubscribe().catch(() => false);
        throw error;
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: pushKeys.device }),
  });
}

/** „Изключи на това устройство“: махане на абонамента в браузъра и `DELETE` в api-то. */
export function useDisablePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (subscription: PushSubscription) => {
      const { endpoint } = subscription;
      await subscription.unsubscribe();
      await apiFetch(
        '/notifications/subscription',
        { parse: () => undefined },
        {
          method: 'DELETE',
          headers: JSON_HEADERS,
          body: JSON.stringify({ endpoint }),
        },
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: pushKeys.device }),
  });
}

/** Видовете известия на действащия потребител (важат за всичките му устройства). */
export function useNotificationSettings() {
  const { actingUserId } = useActingUser();
  return useQuery({
    queryKey: pushKeys.settings(actingUserId),
    queryFn: () =>
      apiFetch('/notifications/settings', notificationSettingsBodySchema).then(
        (body) => body.settings,
      ),
    enabled: actingUserId !== null,
  });
}

/** Превключвател на вид: оптимистично, с връщане при грешка. */
export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  const { actingUserId } = useActingUser();
  const key = pushKeys.settings(actingUserId);
  return useMutation({
    mutationFn: (settings: NotificationSettings) =>
      apiFetch('/notifications/settings', notificationSettingsBodySchema, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ settings }),
      }).then((body) => body.settings),
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationSettings>(key);
      queryClient.setQueryData(key, settings);
      return { previous };
    },
    onError: (_error, _settings, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(key, settings);
    },
  });
}

/** „Изпрати пробно“ (`POST /api/notifications/test`): до колко устройства на човека е тръгнало. */
export function useSendTestNotification() {
  return useMutation({
    mutationFn: () =>
      apiFetch('/notifications/test', pushTestResponseSchema, {
        method: 'POST',
      }).then((body) => body.sent),
  });
}

/**
 * Смяна на действащия потребител (GLOSSARY: acting user) на абонирано устройство изпраща абонамента отново, за да
 * отиде към новия човек (api-то мести познатия `endpoint`). Монтира се веднъж в `App`.
 */
export function usePushFollowsActingUser() {
  const { actingUserId } = useActingUser();
  const previous = useRef(actingUserId);

  useEffect(() => {
    if (previous.current === actingUserId) {
      return;
    }
    previous.current = actingUserId;
    if (!actingUserId || readDeviceMode() !== 'phone' || !pushSupported()) {
      return;
    }
    currentSubscription()
      .then((subscription) => subscription && putSubscription(subscription))
      .catch((error: unknown) => {
        logger.warn('push: абонаментът не се премести', error);
      });
  }, [actingUserId]);
}
