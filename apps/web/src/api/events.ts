import {
  SERVER_EVENT_TYPES,
  type ServerEvent,
  serverEventSchema,
} from '@family/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { readActingUserId, useWritingUserId } from '../app/acting-user';
import { inboxKeys } from '../features/inbox/queries';
import { menuKeys } from '../features/menu/queries';
import { noteProposalChange } from '../features/menu/unseen-proposals';
import { pantryKeys } from '../features/pantry/queries';
import { shoppingKeys } from '../features/shopping/queries';
import { logger } from '../logger';
import { queryKeys } from './queries';

/** Потокът със сигналите на кутията на `userId`; без човек (kiosk, TV) — само общите. */
function eventsUrl(userId: string | null): string {
  return userId
    ? `/api/events?user=${encodeURIComponent(userId)}`
    : '/api/events';
}

/** Всичко, което сигналите покриват: менюто и списъкът за пазаруване на всяка седмица, килерът и кутията. */
function invalidateAll(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: menuKeys.all });
  void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
  void queryClient.invalidateQueries({ queryKey: pantryKeys.all });
  void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
}

/**
 * `menu.changed` презарежда и дашборда: „Днес се готви“ (готвачът) е от менюто.
 * `menu.proposal.changed` презарежда последното предложение на седмицата (чакането на другия телефон) и отбелязва
 * готовото чуждо като невидяно (точката на „Меню“);
 * `menu.rework.changed` презарежда последната преработка на седмицата (лентата „AI преработва менюто…“);
 * `inbox.changed` идва само на потока на човека: презарежда камбанката и отворената кутия;
 * `shopping.changed` без седмица идва от килера: важи за всеки списък и за самия килер.
 */
function invalidate(queryClient: QueryClient, event: ServerEvent) {
  if (event.type === 'inbox.changed') {
    void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
  } else if (event.type === 'menu.changed') {
    void queryClient.invalidateQueries({
      queryKey: menuKeys.plan(event.weekStart),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  } else if (event.type === 'menu.proposal.changed') {
    void queryClient.invalidateQueries({
      queryKey: menuKeys.weekProposal(event.weekStart),
    });
    void noteProposalChange(queryClient, event.weekStart, readActingUserId());
  } else if (event.type === 'menu.rework.changed') {
    void queryClient.invalidateQueries({
      queryKey: menuKeys.weekRework(event.weekStart),
    });
  } else if (event.weekStart) {
    void queryClient.invalidateQueries({
      queryKey: shoppingKeys.list(event.weekStart),
    });
  } else {
    void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
    void queryClient.invalidateQueries({ queryKey: pantryKeys.all });
  }
}

/**
 * Свежест между устройствата (`GET /api/events`): сигналът „X се промени“ инвалидира заявката на React Query, а
 * данните идват през същите REST заявки. След прекъсната връзка (`EventSource` се свързва сам) и при връщане към
 * приложението се презарежда всичко под `menu`, `shopping` и `inbox`, защото сигналите междувременно са изпуснати.
 * Потокът носи пишещия човек (`?user=`), за да идват сигналите на неговата кутия; при смяна се отваря наново.
 * Монтира се веднъж, в корена на приложението.
 */
export function useServerEvents() {
  const queryClient = useQueryClient();
  const userId = useWritingUserId();

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      return;
    }
    const source = new EventSource(eventsUrl(userId));
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
  }, [queryClient, userId]);
}
