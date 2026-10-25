import { z } from 'zod';

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'down', 'skipped']),
});

export type Health = z.infer<typeof healthSchema>;
