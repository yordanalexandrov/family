import { z } from 'zod';

/** `GET /healthz`: 200 `{ status: 'ok', db: 'ok' }` or 503 `{ status: 'degraded', db: 'down' }`. */
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'down']),
});

export type Health = z.infer<typeof healthSchema>;
