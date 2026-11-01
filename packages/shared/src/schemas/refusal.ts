import { z } from 'zod';
import { applianceExistsSchema } from './appliance.js';
import {
  noAppliedChangeSchema,
  noEarlierQuestionSchema,
} from './cooking-question.js';
import { noReplacementSchema } from './meal-replacement.js';
import {
  emptyMealSchema,
  noPlanSchema,
  noProposalSchema,
  notEnoughRecipesSchema,
  pastMealSchema,
  systemLineSchema,
} from './menu.js';
import { cookTakenSchema, pushDisabledSchema } from './notifications.js';
import { alreadyInPantrySchema, notStapleSchema } from './pantry.js';
import {
  revisionOpenSchema,
  revisionStaleSchema,
} from './recipe-revision.js';
import { mealWithoutRecipeSchema } from './shopping.js';

/**
 * Every refusal with a sub-code: the body of an `apiErrorSchema` error that also carries `code` and, per code, its
 * details. Api throws them with `refuse(code, message, details)` (`services/errors.ts`), web reads them with
 * `refusalOf(error, code)` (`api/client.ts`); a new sub-code is added here.
 */
export const refusalSchemas = {
  no_plan: noPlanSchema,
  no_proposal: noProposalSchema,
  no_replacement: noReplacementSchema,
  not_enough_recipes: notEnoughRecipesSchema,
  already_in_pantry: alreadyInPantrySchema,
  not_staple: notStapleSchema,
  push_disabled: pushDisabledSchema,
  cook_taken: cookTakenSchema,
  system_line: systemLineSchema,
  past_meal: pastMealSchema,
  appliance_exists: applianceExistsSchema,
  empty_meal: emptyMealSchema,
  no_earlier_question: noEarlierQuestionSchema,
  no_applied_change: noAppliedChangeSchema,
  meal_without_recipe: mealWithoutRecipeSchema,
  revision_open: revisionOpenSchema,
  revision_stale: revisionStaleSchema,
} as const;

export const refusalSchema = z.discriminatedUnion(
  'code',
  Object.values(refusalSchemas) as [
    (typeof refusalSchemas)[RefusalCode],
    ...(typeof refusalSchemas)[RefusalCode][],
  ],
);

export type RefusalCode = keyof typeof refusalSchemas;

/** The body of the refusal `C`. */
export type RefusalOf<C extends RefusalCode> = z.infer<
  (typeof refusalSchemas)[C]
>;

export type Refusal = RefusalOf<RefusalCode>;

/** What a refusal `C` carries besides `error`, `code` and `message` (e.g. `have` and `need`). */
export type RefusalDetails<C extends RefusalCode> = Omit<
  RefusalOf<C>,
  'error' | 'code' | 'message'
>;

/** The `error` code (and so the status) a refusal `C` is answered with, e.g. `not_found` for `no_plan`. */
export function refusalErrorOf<C extends RefusalCode>(
  code: C,
): RefusalOf<C>['error'] {
  return refusalSchemas[code].shape.error.value;
}

/** The body as the refusal `C`, or `null` when it is anything else (another code, or details that do not match). */
export function parseRefusal<C extends RefusalCode>(
  code: C,
  body: unknown,
): RefusalOf<C> | null {
  const parsed = refusalSchemas[code].safeParse(body);
  // `refusalSchemas[code]` is the schema of `C`, but TS widens the indexed access to the union of all of them.
  return parsed.success ? (parsed.data as RefusalOf<C>) : null;
}
