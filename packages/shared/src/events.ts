import { z } from 'zod';
import { weekStartSchema } from './schemas/menu.js';

/**
 * The signals of `GET /api/events` (Server-Sent Events): only "this changed", never the data. The client invalidates its
 * queries and reads the data through the same REST routes. One SSE message per event: `event: <type>`, `data: <json>`.
 */
export const serverEventSchema = z.discriminatedUnion('type', [
  /** The plan of the week, or one of its meals, changed (created, deleted, edited, proposed). */
  z.object({ type: z.literal('menu.changed'), weekStart: weekStartSchema }),
  /** The shopping list of the week changed: a check, a hidden row, a manual row, or the menu it is computed from. */
  z.object({ type: z.literal('shopping.changed'), weekStart: weekStartSchema }),
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;

export type ServerEventType = ServerEvent['type'];

/** Every type of `serverEventSchema`, read from the schema: the client subscribes to each. */
export const SERVER_EVENT_TYPES: readonly ServerEventType[] =
  serverEventSchema.options.map((option) => option.shape.type.value);
