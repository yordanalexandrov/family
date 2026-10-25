import { z } from 'zod';
import { freshnessSchema } from './sync.js';

/**
 * `GET /healthz`: 200 `{ status: 'ok', db: 'ok' }` or 503 `{ status: 'degraded', db: 'down' }`.
 * `sync` tells how fresh each source's data is; it never changes the HTTP status.
 */
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'down']),
  sync: z
    .object({
      calendar: freshnessSchema,
      budget: freshnessSchema,
    })
    .optional(),
});

export type Health = z.infer<typeof healthSchema>;
