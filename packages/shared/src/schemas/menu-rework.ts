import { z } from 'zod';
import { contractFailureSchema } from '../contracts/failure.js';
import { hintSchema } from '../contracts/hint.js';
import { contractRequestStatusSchema } from '../contracts/request.js';
import { instantSchema } from './dates.js';
import { refusalBody } from './error.js';
import { weekStartSchema } from './menu.js';

/**
 * One run of `menu.rework` for the plan of a week (GLOSSARY: Преработка на менюто, AI заявка). A `done` one has
 * written its answer into the plan; `changed` is how many meals it changed then (a day that got its own recipe back is
 * not counted). At most one `pending` per plan; while it is, the week's votes and content are locked.
 */
export const menuReworkRequestSchema = z.object({
  id: z.uuid(),
  weekStart: weekStartSchema,
  planId: z.uuid(),
  hint: z.string().optional(),
  status: contractRequestStatusSchema,
  error: contractFailureSchema.optional(),
  requestedBy: z.uuid(),
  changed: z.int().min(0).optional(),
  createdAt: instantSchema,
  finishedAt: instantSchema.optional(),
});

export type MenuReworkRequest = z.infer<typeof menuReworkRequestSchema>;

/** `POST /api/menu/reworks`: rework the menu of the week, with an optional hint for the whole week. */
export const createMenuReworkSchema = z.object({
  weekStart: weekStartSchema,
  hint: hintSchema.optional(),
});

export type CreateMenuRework = z.infer<typeof createMenuReworkSchema>;

/** `GET /api/menu/reworks?weekStart=`: the newest rework of the week, for the banner on every device. */
export const menuReworksQuerySchema = z.object({ weekStart: weekStartSchema });

export type MenuReworksQuery = z.infer<typeof menuReworksQuerySchema>;

/** `POST /api/menu/reworks` (202), `GET /api/menu/reworks/:id` and `GET /api/menu/reworks?weekStart=`. */
export const menuReworkResponseSchema = z.object({
  rework: menuReworkRequestSchema,
});

/**
 * 409 while a rework of the week is pending: of a second rework, and of the writes it locks (votes, content, the
 * thread, „Предложи друго“, deleting the menu).
 */
export const menuReworkingSchema = refusalBody('conflict', 'menu_reworking');

export type MenuReworking = z.infer<typeof menuReworkingSchema>;

/** 409 of `POST /api/menu/reworks` while „✨ Предложи друго“ is pending for a meal of the week. */
export const replacementPendingSchema = refusalBody(
  'conflict',
  'replacement_pending',
);

export type ReplacementPending = z.infer<typeof replacementPendingSchema>;

/** 409 of `POST /api/menu/reworks` when no day from today on is to replace or to fill (`classifyRework`). */
export const nothingToReworkSchema = refusalBody(
  'conflict',
  'nothing_to_rework',
);

export type NothingToRework = z.infer<typeof nothingToReworkSchema>;

/** 404 of `GET /api/menu/reworks?weekStart=` when nobody has reworked the menu of the week. */
export const noReworkSchema = refusalBody('not_found', 'no_rework');

export type NoRework = z.infer<typeof noReworkSchema>;
