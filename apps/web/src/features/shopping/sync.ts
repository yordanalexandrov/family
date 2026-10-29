import type { DateKey } from '@family/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnline } from '../../lib/use-online';
import { onQueueChange, queuedChecks } from './offline';
import { shoppingKeys } from './queries';

/**
 * Колко дълго отметка стои неизпратена, преди да се брои. Онлайн отговорът идва по-бързо, затова броят остава 0 и
 * нищо на екрана не се появява и изчезва при всяка отметка (епик #199, С5).
 */
export const UNSENT_AFTER_MS = 800;

export interface CheckSync {
  /** Колко отметки на седмицата чакат: без връзка всички, с връзка само стоялите поне `UNSENT_AFTER_MS`. */
  pending: number;
  /** Дали има връзка. */
  online: boolean;
  /** Пробва да изпрати чакащите отметки веднага (и презарежда списъка). */
  sendNow: () => Promise<void>;
}

/** Синхронизацията на отметките в „Пазаруване“: опашката от `offline.ts`, видяна от иконата за синхронизация. */
export function useCheckSync(weekStart: DateKey): CheckSync {
  const queryClient = useQueryClient();
  const online = useOnline();
  const queued = useQueuedIds(weekStart);
  const overdue = useOverdue(queued);

  const sendNow = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: shoppingKeys.list(weekStart),
      }),
    [queryClient, weekStart],
  );

  return {
    pending: online
      ? queued.filter((id) => overdue.has(id)).length
      : queued.length,
    online,
    sendNow,
  };
}

/** Идентификаторите на чакащите отметки на седмицата, обновявани при всяка промяна на опашката. */
function useQueuedIds(weekStart: DateKey): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let latest = 0;
    let active = true;
    const read = () => {
      const call = ++latest;
      void queuedChecks(weekStart).then((queue) => {
        // Само последното четене: по-старо, завършило по-късно, не връща вече изпратена отметка.
        if (active && call === latest) {
          setIds(queue.map((entry) => entry.id));
        }
      });
    };
    read();
    const unsubscribe = onQueueChange(read);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [weekStart]);
  return ids;
}

/** Кои от `ids` стоят в опашката поне `UNSENT_AFTER_MS`, броено от момента, в който са се появили в нея. */
function useOverdue(ids: string[]): ReadonlySet<string> {
  const [overdue, setOverdue] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const running = timers.current;
    for (const id of ids) {
      if (!running.has(id)) {
        running.set(
          id,
          setTimeout(
            () => setOverdue((prev) => new Set(prev).add(id)),
            UNSENT_AFTER_MS,
          ),
        );
      }
    }
    for (const [id, timer] of running) {
      if (!ids.includes(id)) {
        clearTimeout(timer);
        running.delete(id);
      }
    }
    setOverdue((prev) =>
      [...prev].every((id) => ids.includes(id))
        ? prev
        : new Set([...prev].filter((id) => ids.includes(id))),
    );
  }, [ids]);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running.values()) {
        clearTimeout(timer);
      }
      running.clear();
    };
  }, []);

  return overdue;
}
