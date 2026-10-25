import { z } from 'zod';
import { instantSchema } from './dates.js';

/** The external systems the api syncs into its cache (GLOSSARY: Синхронизация). */
export const syncSourceSchema = z.enum(['calendar', 'budget']);

export type SyncSource = z.infer<typeof syncSourceSchema>;

/** How fresh the cached data of a source is; `stale` per GLOSSARY: Остарели данни. */
export const freshnessSchema = z.enum([
  'ok',
  'stale',
  'failed',
  'unconfigured',
]);

export type Freshness = z.infer<typeof freshnessSchema>;

/** Outcome of the latest sync run of a source as stored; `unconfigured` when the source has no config. */
export const lastRunStatusSchema = z.enum([
  'ok',
  'failed',
  'running',
  'unconfigured',
]);

export type LastRunStatus = z.infer<typeof lastRunStatusSchema>;

export const syncStatusSchema = z.object({
  source: syncSourceSchema,
  status: freshnessSchema,
  lastSuccessAt: instantSchema.nullable(),
  /** Message of the latest failed attempt, when the latest attempt failed. */
  lastError: z.string().nullable(),
});

export type SyncStatus = z.infer<typeof syncStatusSchema>;

/** Answer of a manual `POST /api/sync/:source`. */
export const syncRunResultSchema = z.object({
  source: syncSourceSchema,
  status: lastRunStatusSchema,
  durationMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

export type SyncRunResult = z.infer<typeof syncRunResultSchema>;
