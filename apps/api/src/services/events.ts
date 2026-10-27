import type { ServerEvent } from '@family/shared';

export type ServerEventListener = (event: ServerEvent) => void;

/**
 * The in-memory bus of change signals (`GET /api/events`); created once in `buildApp()` as `app.events`. The api is the
 * only process and the only writer, so there is no `LISTEN/NOTIFY` or Redis. Services publish only after their
 * transaction has committed, so a client that reloads on the signal reads the change.
 */
export interface EventBus {
  publish(event: ServerEvent): void;
  /** Returns the unsubscribe. */
  subscribe(listener: ServerEventListener): () => void;
  /** How many listeners are subscribed (open event streams); logged by the route. */
  readonly subscribers: number;
}

export function createEventBus(
  onListenerError: (error: unknown) => void = () => {},
): EventBus {
  const listeners = new Set<ServerEventListener>();
  return {
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          // A broken stream must not fail the write that published, nor the other listeners.
          onListenerError(error);
        }
      }
    },
    subscribe(listener) {
      // Wrapped, so the same function subscribed twice gets two independent subscriptions.
      const entry: ServerEventListener = (event) => listener(event);
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    get subscribers() {
      return listeners.size;
    },
  };
}

/** The signals of a change to a meal (its content, cook or servings): the shopping list is computed from the menu. */
export function menuAndShoppingChanged(weekStart: string): ServerEvent[] {
  return [
    { type: 'menu.changed', weekStart },
    { type: 'shopping.changed', weekStart },
  ];
}
