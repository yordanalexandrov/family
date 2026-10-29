import { z } from 'zod';
import { refusalBody } from './error.js';

/** Longest name of an appliance: „вид (модел) — какво може / ограничение“. */
export const APPLIANCE_NAME_MAX = 200;

/**
 * A special appliance of the household (GLOSSARY: Уред), household data changed from „Настройки“. `name` is in Bulgarian,
 * „вид (модел) — какво може / ограничение“; only enabled ones reach `recipe.suggest`.
 */
export const applianceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  enabled: z.boolean(),
});

export type Appliance = z.infer<typeof applianceSchema>;

/** `POST /api/appliances`: a new appliance, enabled unless said otherwise. */
export const createApplianceSchema = z.object({
  name: z.string().trim().min(1).max(APPLIANCE_NAME_MAX),
  enabled: z.boolean().default(true),
});

export type CreateAppliance = z.infer<typeof createApplianceSchema>;

/** `PUT /api/appliances/:id`: on or off. */
export const updateApplianceSchema = z.object({
  enabled: z.boolean(),
});

export type UpdateAppliance = z.infer<typeof updateApplianceSchema>;

/** `GET /api/appliances`: in the order they were added. */
export const appliancesResponseSchema = z.object({
  appliances: z.array(applianceSchema),
});

export type AppliancesResponse = z.infer<typeof appliancesResponseSchema>;

export const applianceResponseSchema = z.object({
  appliance: applianceSchema,
});

export type ApplianceResponse = z.infer<typeof applianceResponseSchema>;

/** 409 of `POST /api/appliances`: the household has an appliance with this name already, in any case. */
export const applianceExistsSchema = refusalBody(
  'conflict',
  'appliance_exists',
);

export type ApplianceExists = z.infer<typeof applianceExistsSchema>;
