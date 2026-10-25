import { z } from 'zod';
import { budgetSnapshotSchema } from './budget.js';
import { dayEventsSchema } from './calendar.js';
import { dateKeySchema, instantSchema } from './dates.js';
import { syncStatusSchema } from './sync.js';

/** „Днес се готви“ for one slot: the recipe title (or the note of the meal) and who cooks it. */
export const cookingMealSchema = z.object({
  title: z.string(),
  cookUserId: z.uuid(),
});

export type CookingMeal = z.infer<typeof cookingMealSchema>;

/** „Днес се готви“: always `{ lunch: null, dinner: null }` in Phase 1; the menu epic fills it. */
export const cookingSchema = z.object({
  lunch: cookingMealSchema.nullable(),
  dinner: cookingMealSchema.nullable(),
});

export type Cooking = z.infer<typeof cookingSchema>;

/** `GET /api/dashboard`: everything the kiosk, TV and phone screens show. */
export const dashboardResponseSchema = z.object({
  /** Today in Sofia. */
  today: dateKeySchema,
  /** The server's clock, so devices can tell how far theirs is off. */
  now: instantSchema,
  /** Today and the next three days. */
  days: z.array(dayEventsSchema).length(4),
  /** Latest budget snapshot; `null` when none has been synced yet. */
  budget: budgetSnapshotSchema.nullable(),
  cooking: cookingSchema,
  sync: z.object({
    calendar: syncStatusSchema,
    budget: syncStatusSchema,
  }),
});

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
