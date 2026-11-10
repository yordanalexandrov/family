import {
  type InboxItem,
  inboxResponseSchema,
  inboxUnreadCountSchema,
  type PushAction,
} from '@family/shared';
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiFetch } from '../../api/client';
import { queryKeys } from '../../api/queries';
import { useWritingUserId } from '../../app/acting-user';
import { showAppBadge } from '../../app/app-badge';
import { menuKeys } from '../menu/queries';

/**
 * Ключовете на Входящата кутия (GLOSSARY: Входяща кутия): всичко е под `['inbox']`, по човек, за да не се покаже
 * кутията на другия след смяна. Инвалидирането на `inboxKeys.all` обновява и екрана, и камбанката.
 */
export const inboxKeys = {
  all: ['inbox'] as const,
  items: (userId: string | null) => ['inbox', userId, 'items'] as const,
  unread: (userId: string | null) => ['inbox', userId, 'unread'] as const,
};

/** `GET /api/inbox`: известията на действащия потребител, последно обновените отгоре. */
export function useInbox() {
  const userId = useWritingUserId();
  return useQuery({
    queryKey: inboxKeys.items(userId),
    queryFn: () =>
      apiFetch('/inbox', inboxResponseSchema).then((body) => body.items),
    enabled: userId !== null,
  });
}

/** `GET /api/inbox/unread-count`: бройката на камбанката; без действащ потребител (kiosk, TV) не се пита. */
export function useInboxUnreadCount() {
  const userId = useWritingUserId();
  return useQuery({
    queryKey: inboxKeys.unread(userId),
    queryFn: () =>
      apiFetch('/inbox/unread-count', inboxUnreadCountSchema).then(
        (body) => body.unread,
      ),
    enabled: userId !== null,
  });
}

/**
 * Бройката на непрочетените и върху иконата на приложението (Badging API) при всяка промяна: SSE, прочитане, смяна на
 * човека. Без действащ човек (kiosk, TV) иконата не се пипа. Монтира се веднъж, в корена на приложението.
 */
export function useAppBadge() {
  const unread = useInboxUnreadCount().data;
  useEffect(() => {
    if (unread !== undefined) {
      void showAppBadge(navigator, unread);
    }
  }, [unread]);
}

/** `POST` с 204 без тяло. */
function post(path: string) {
  return apiFetch(path, { parse: () => undefined }, { method: 'POST' });
}

/**
 * Прочитането е оптимистично: записите (`read` решава кои) стават прочетени и бройката пада веднага, а после
 * кутията се чете наново. Мутацията довършва и след като екранът е сменен (натискане на ред води към линка му).
 */
function markRead(
  queryClient: QueryClient,
  userId: string | null,
  read: (item: InboxItem) => boolean,
) {
  queryClient.setQueryData<InboxItem[]>(inboxKeys.items(userId), (items) =>
    items?.map((item) => (read(item) ? { ...item, unread: false } : item)),
  );
  const items = queryClient.getQueryData<InboxItem[]>(inboxKeys.items(userId));
  if (items) {
    queryClient.setQueryData(
      inboxKeys.unread(userId),
      items.filter((item) => item.unread).length,
    );
  }
}

function useReadMutation<T>(
  mutationFn: (input: T) => Promise<void>,
  read: (input: T) => (item: InboxItem) => boolean,
) {
  const queryClient = useQueryClient();
  const userId = useWritingUserId();
  return useMutation({
    mutationFn,
    async onMutate(input) {
      await queryClient.cancelQueries({ queryKey: inboxKeys.all });
      markRead(queryClient, userId, read(input));
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

/** `POST /api/inbox/:id/read`: един запис става прочетен. */
export function useReadInboxItem() {
  return useReadMutation(
    (id: string) => post(`/inbox/${id}/read`),
    (id) => (item) => item.id === id,
  );
}

/** `POST /api/inbox/read-all`: „Всички прочетени“. */
export function useReadAllInbox() {
  return useReadMutation<void>(
    () => post('/inbox/read-all'),
    () => () => true,
  );
}

/**
 * Бутон на известие от реда („Извадих“, „Аз“): същият api път като бутона на push (`post`), с действащия потребител.
 * След отговора (и при отказ, напр. 409 `cook_taken`) кутията, дашбордът и менюто се презареждат.
 */
export function useInboxAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: PushAction) => post(action.post.replace(/^\/api/, '')),
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries(menuKeys.plans);
    },
  });
}
