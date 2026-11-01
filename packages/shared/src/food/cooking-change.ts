import { z } from 'zod';
import { type Amount, scaleQuantity } from './scale.js';
import {
  checkPinchQuantity,
  quantitySchema,
  type Unit,
  unitSchema,
} from './units.js';

/**
 * A cooking change (GLOSSARY: Промяна за готвенето): what the answer to a question in Готвене changes in the recipe
 * for this cooking only, applied with „Промени“. Its products are free names with an amount for the servings on the
 * screen when the question was asked; the lines are by their index in the recipe as Готвене shows it (the recipe's
 * lines in order, with the lines added by applied changes after them).
 *
 * `ingredients` is the only part for now; the new text of steps (#277) goes next to it as one more list.
 */

/** Longest product name a change may bring. */
export const COOKING_CHANGE_NAME_MAX = 100;

/** A product a change brings: a free name and an amount in a unit of the list (a pinch has none). */
export const changedIngredientSchema = z
  .object({
    name: z.string().trim().min(1).max(COOKING_CHANGE_NAME_MAX),
    quantity: quantitySchema,
    unit: unitSchema,
  })
  .superRefine(checkPinchQuantity);

export type ChangedIngredient = z.infer<typeof changedIngredientSchema>;

const lineIndexSchema = z.int().min(0);

/** One entry for the products: a line replaced by a product, a line removed, or a new line at the end. */
export const ingredientChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('replace'),
    index: lineIndexSchema,
    ingredient: changedIngredientSchema,
  }),
  z.object({ kind: z.literal('remove'), index: lineIndexSchema }),
  z.object({ kind: z.literal('add'), ingredient: changedIngredientSchema }),
]);

export type IngredientChange = z.infer<typeof ingredientChangeSchema>;

/** At most one entry for a line, and something to change. */
function checkChange(
  change: { ingredients: readonly IngredientChange[] },
  ctx: z.RefinementCtx,
): void {
  if (change.ingredients.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'Празна промяна: без промяна change е null.',
    });
  }
  const seen = new Set<number>();
  change.ingredients.forEach((entry, at) => {
    if (entry.kind === 'add') {
      return;
    }
    if (seen.has(entry.index)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ingredients', at, 'index'],
        message: `Два записа за ред ${entry.index} на продуктите.`,
      });
    }
    seen.add(entry.index);
  });
}

/** A cooking change as the answer brings it and as it is stored with the question. */
export const cookingChangeSchema = z
  .object({ ingredients: z.array(ingredientChangeSchema) })
  .superRefine(checkChange);

export type CookingChange = z.infer<typeof cookingChangeSchema>;

/**
 * A product line in Готвене: its name and the amount for `servings` (the recipe's for its own lines, the servings on
 * the screen when the question was asked for a line from a change). `changed` for a line a change replaced or added,
 * `removed` for one it removed (it stays in its place, so the indices of the lines do not move).
 */
export interface CookingLine extends Amount {
  name: string;
  note?: string;
  servings: number;
  changed?: true;
  removed?: true;
}

/** A change applied in Готвене, with the servings on the screen when its question was asked. */
export interface AppliedCookingChange {
  change: CookingChange;
  servings: number;
}

/** The recipe's lines as Готвене starts with them: by the product's name, for the recipe's servings. */
export function recipeCookingLines(recipe: {
  servings: number;
  ingredients: readonly {
    ingredient: { name: string };
    quantity: number | null;
    unit: Unit;
    note?: string;
  }[];
}): CookingLine[] {
  return recipe.ingredients.map((line) => ({
    name: line.ingredient.name,
    quantity: line.quantity,
    unit: line.unit,
    ...(line.note === undefined ? {} : { note: line.note }),
    servings: recipe.servings,
  }));
}

function applyOne(
  lines: readonly CookingLine[],
  { change, servings }: AppliedCookingChange,
): CookingLine[] {
  const next = [...lines];
  for (const entry of change.ingredients) {
    if (entry.kind === 'add') {
      next.push({ ...entry.ingredient, servings, changed: true });
      continue;
    }
    const line = next[entry.index];
    if (!line || entry.index >= lines.length) {
      // A line of a change that is no longer applied, or of a recipe that has lost lines since.
      continue;
    }
    next[entry.index] =
      entry.kind === 'replace'
        ? { ...entry.ingredient, servings, changed: true }
        : { ...line, removed: true };
  }
  return next;
}

/**
 * The lines after the applied changes, in the order they were applied: a later entry for a line wins over an earlier
 * one. An entry for a line that is not there is passed over (the change that added it is no longer applied).
 */
export function applyCookingChanges(
  lines: readonly CookingLine[],
  applied: readonly AppliedCookingChange[],
): CookingLine[] {
  return applied.reduce<CookingLine[]>(applyOne, [...lines]);
}

/** The line's amount for `servings` on the screen, as Готвене reads it (`scaleQuantity`). */
export function scaleCookingLine(line: CookingLine, servings: number): Amount {
  return scaleQuantity(line, line.servings, servings);
}
