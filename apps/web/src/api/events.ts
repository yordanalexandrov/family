import {
  SERVER_EVENT_TYPES,
  type ServerEvent,
  serverEventSchema,
} from '@family/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { menuKeys } from '../features/menu/queries';
import { shoppingKeys } from '../features/shopping/queries';
import { logger } from '../logger';

const EVENTS_URL = '/api/events';

/** Всичко, което сигналите покриват: менюто и списъкът за пазаруване на всяка седмица. */
function invalidateAll(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: menuKeys.all });
  void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
}

function invalidate(queryClient: QueryClient, event: ServerEvent) {
  const queryKey =
    event.type === 'menu.changed'
      ? menuKeys.plan(event.weekStart)
      : shoppingKeys.list(event.weekStart);
  void queryClient.invalidateQueries({ queryKey });
}

/**
 * Свежест между устройствата (`GET /api/events`): сигналът „X се промени“ инвалидира заявката на React Query, а
 * данните идват през същите REST заявки. След прекъсната връзка (`EventSource` се свързва сам) и при връщане към
 * приложението се презарежда всичко под `menu` и `shopping`, защото сигналите междувременно са изпуснати.
 * Монтира се веднъж, в корена на приложението.
 */
export function useServerEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      return;
    }
    const source = new EventSource(EVENTS_URL);
    let connectedBefore = false;
    const onOpen = () => {
      if (connectedBefore) {
        invalidateAll(queryClient);
      }
      connectedBefore = true;
    };
    const onSignal = (message: Event) => {
      let data: unknown;
      try {
        data = JSON.parse((message as MessageEvent<string>).data);
      } catch {
        data = undefined;
      }
      const parsed = serverEventSchema.safeParse(data);
      if (!parsed.success) {
        logger.warn('Непознат сигнал от /api/events', parsed.error);
        return;
      }
      invalidate(queryClient, parsed.data);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        invalidateAll(queryClient);
      }
    };

    source.addEventListener('open', onOpen);
    for (const type of SERVER_EVENT_TYPES) {
      source.addEventListener(type, onSignal);
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      source.close();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [queryClient]);
}
