import {
  type CreateManualItem,
  createManualItemSchema,
  type DateKey,
  type ShoppingItem,
  type ShoppingList,
  setCheckedSchema,
  setHiddenSchema,
  shoppingItemResponseSchema,
  shoppingListResponseSchema,
} from '@family/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiFetch, isConnectionError, JSON_HEADERS } from '../../api/client';
import { readActingUserId } from '../../app/acting-user';
import {
  applyQueuedChecks,
  enqueueCheck,
  flushQueuedChecks,
  type QueuedCheck,
  queuedChecks,
  readCachedList,
  writeCachedList,
} from './offline';

/** Докато екранът е отворен, отметките на другия се виждат до 15 s. */
const REFRESH_INTERVAL_MS = 15_000;

export const shoppingKeys = {
  all: ['shopping'] as const,
  list: (weekStart: DateKey) => ['shopping', weekStart] as const,
};

export type ShoppingWeekData = {
  list: ShoppingList;
  /** Без връзка: кога е взет показаният (кеширан) списък; `null`, когато е от api-то сега. */
  staleSince: Date | null;
};

const listPath = (weekStart: DateKey) => `/shopping-lists/${weekStart}`;
const itemPath = (weekStart: DateKey, key: string) =>
  `${listPath(weekStart)}/items/${encodeURIComponent(key)}`;

function sendCheck(entry: QueuedCheck) {
  return apiFetch(
    `${itemPath(entry.weekStart, entry.key)}/checked`,
    shoppingItemResponseSchema,
    {
      method: 'PUT',
      headers: entry.actingUser
        ? { ...JSON_HEADERS, 'X-Acting-User': entry.actingUser }
        : JSON_HEADERS,
      body: JSON.stringify(setCheckedSchema.parse({ checked: entry.checked })),
    },
  );
}

/**
 * Списъкът на седмицата: първо изпраща чакащите отметки, после го чете. Без връзка показва последния успешен
 * отговор; чакащите отметки са приложени отгоре и в двата случая.
 */
async function fetchShoppingWeek(
  weekStart: DateKey,
): Promise<ShoppingWeekData> {
  await flushQueuedChecks(sendCheck);
  let list: ShoppingList;
  let staleSince: Date | null = null;
  try {
    list = (await apiFetch(listPath(weekStart), shoppingListResponseSchema))
      .list;
    await writeCachedList(list, new Date());
  } catch (error) {
    const cached = isConnectionError(error)
      ? await readCachedList(weekStart)
      : null;
    if (!cached) {
      throw error;
    }
    list = cached.list;
    staleSince = cached.fetchedAt;
  }
  return {
    list: applyQueuedChecks(list, await queuedChecks(weekStart)),
    staleSince,
  };
}

export function useShoppingWeek(weekStart: DateKey) {
  return useQuery({
    queryKey: shoppingKeys.list(weekStart),
    queryFn: () => fetchShoppingWeek(weekStart),
    refetchInterval: REFRESH_INTERVAL_MS,
    // `visibilitychange`: връщане към екрана презарежда веднага.
    refetchOnWindowFocus: 'always',
    // Без връзка queryFn пак тръгва и показва кеша; при `online` екранът сам презарежда.
    networkMode: 'always',
    refetchOnReconnect: false,
  });
}

/**
 * Отметка/разотметка: веднага в списъка на екрана и в опашката; после списъкът се презарежда, което изпраща
 * опашката, ако има връзка. Опашката се записва първа, затова презареждане, тръгнало междувременно, я вижда.
 */
export function useToggleCheck(weekStart: DateKey) {
  const queryClient = useQueryClient();
  return useCallback(
    async (item: ShoppingItem) => {
      const queryKey = shoppingKeys.list(weekStart);
      const entry = {
        weekStart,
        key: item.key,
        checked: item.checkedBy === null,
        actingUser: readActingUserId(),
        at: new Date().toISOString(),
      };
      const queued = enqueueCheck(entry);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<ShoppingWeekData>(queryKey, (data) =>
        data
          ? {
              ...data,
              list: applyQueuedChecks(data.list, [entry]),
            }
          : data,
      );
      await queued;
      await queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, weekStart],
  );
}

/** Без връзка ръчните редове и скриването не правят нищо (епик #41: Офлайн). */
export class OfflineError extends Error {
  constructor() {
    super('Няма връзка');
    this.name = 'OfflineError';
  }
}

function requireOnline() {
  if (!navigator.onLine) {
    throw new OfflineError();
  }
}

/** Промяна, която изисква връзка; после списъкът се презарежда. */
function useListChange<T>(
  weekStart: DateKey,
  change: (input: T) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      requireOnline();
      await change(input);
    },
    networkMode: 'always',
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: shoppingKeys.list(weekStart),
      }),
  });
}

export function useSetHidden(weekStart: DateKey) {
  return useListChange(
    weekStart,
    ({ item, hidden }: { item: ShoppingItem; hidden: boolean }) =>
      apiFetch(
        `${itemPath(weekStart, item.key)}/hidden`,
        shoppingItemResponseSchema,
        {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify(setHiddenSchema.parse({ hidden })),
        },
      ),
  );
}

export function useAddManualItem(weekStart: DateKey) {
  return useListChange(weekStart, (input: CreateManualItem) =>
    apiFetch(`${listPath(weekStart)}/items`, shoppingItemResponseSchema, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(createManualItemSchema.parse(input)),
    }),
  );
}

export function useDeleteManualItem(weekStart: DateKey) {
  return useListChange(weekStart, (item: ShoppingItem) =>
    // 204 без тяло.
    apiFetch(
      itemPath(weekStart, item.key),
      { parse: () => undefined },
      { method: 'DELETE' },
    ),
  );
}
