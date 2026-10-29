import {
  SERVER_EVENT_TYPES,
  type ServerEvent,
  serverEventSchema,
} from '@family/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { readActingUserId } from '../app/acting-user';
import { menuKeys } from '../features/menu/queries';
import { noteProposalChange } from '../features/menu/unseen-proposals';
import { pantryKeys } from '../features/pantry/queries';
import { shoppingKeys } from '../features/shopping/queries';
import { logger } from '../logger';

const EVENTS_URL = '/api/events';

/** Всичко, което сигналите покриват: менюто и списъкът за пазаруване на всяка седмица, и килерът. */
function invalidateAll(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: menuKeys.all });
  void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
  void queryClient.invalidateQueries({ queryKey: pantryKeys.all });
}

/**
 * `menu.proposal.changed` презарежда последното предложение на седмицата (чакането на другия телефон) и отбелязва
 * готовото чуждо като невидяно (точката на „Меню“);
 * `shopping.changed` без седмица идва от килера: важи за всеки списък и за самия килер.
 */
function invalidate(queryClient: QueryClient, event: ServerEvent) {
  if (event.type === 'menu.changed') {
    void queryClient.invalidateQueries({
      queryKey: menuKeys.plan(event.weekStart),
    });
  } else if (event.type === 'menu.proposal.changed') {
    void queryClient.invalidateQueries({
      queryKey: menuKeys.weekProposal(event.weekStart),
    });
    void noteProposalChange(queryClient, event.weekStart, readActingUserId());
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
