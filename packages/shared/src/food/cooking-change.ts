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
 * lines in order, with the lines added by applied changes after them). Its steps are new text for steps the recipe has,
 * by their number on the screen (from 1): steps are never added or removed.
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

/** Longest new text of a step a change may bring. */
export const COOKING_CHANGE_STEP_MAX = 1000;

/** One entry for the steps: the new text of the step with `number` („Стъпка 3 от 4“), from 1. */
export const stepChangeSchema = z.object({
  number: z.int().min(1),
  text: z.string().trim().min(1).max(COOKING_CHANGE_STEP_MAX),
});

export type StepChange = z.infer<typeof stepChangeSchema>;

/** At most one entry for a line and for a step, and something to change. */
function checkChange(
  change: {
    ingredients: readonly IngredientChange[];
    steps: readonly StepChange[];
  },
  ctx: z.RefinementCtx,
): void {
  if (change.ingredients.length === 0 && change.steps.length === 0) {
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
  const seenSteps = new Set<number>();
  change.steps.forEach((entry, at) => {
    if (seenSteps.has(entry.number)) {
      ctx.addIssue({
        code: 'custom',
        path: ['steps', at, 'number'],
        message: `Два записа за стъпка ${entry.number}.`,
      });
    }
    seenSteps.add(entry.number);
  });
}

/**
 * A cooking change as the answer brings it and as it is stored with the question. A missing list is empty: the changes
 * stored before the steps (#276) have none.
 */
export const cookingChangeSchema = z
  .object({
    ingredients: z.array(ingredientChangeSchema).default([]),
    steps: z.array(stepChangeSchema).default([]),
  })
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

/** Whether every replaced or removed line of the change is in `lines`. */
function fits(lines: readonly CookingLine[], { change }: AppliedCookingChange) {
  return change.ingredients.every(
    (entry) => entry.kind === 'add' || entry.index < lines.length,
  );
}

/**
 * The applied changes after „Върни“ on the change `id`: without it and without the later ones that no longer fit, e.g.
 * one that replaced a line only it had added (asked with it applied). Those go with it, so that a change is never shown
 * as applied with entries passed over.
 */
export function withoutCookingChange<
  Applied extends AppliedCookingChange & { id: string },
>(
  lines: readonly CookingLine[],
  applied: readonly Applied[],
  id: string,
): Applied[] {
  const kept: Applied[] = [];
  let current: CookingLine[] = [...lines];
  for (const each of applied) {
    if (each.id !== id && fits(current, each)) {
      kept.push(each);
      current = applyOne(current, each);
    }
  }
  return kept;
}

/** A step in Готвене: the recipe's (its text and photo), `changed` when an applied change gave it new text. */
export type CookingStep<Step extends { text: string }> = Step & {
  changed?: true;
};

/**
 * The steps after the applied changes, in the order they were applied: the new text of a step in its place, with the
 * rest of the step (its photo) as it is, marked `changed`; a later entry for a step wins. The number of steps never
 * changes: an entry for a step the recipe does not have is passed over.
 */
export function applyStepChanges<Step extends { text: string }>(
  steps: readonly Step[],
  applied: readonly AppliedCookingChange[],
): CookingStep<Step>[] {
  const next: CookingStep<Step>[] = [...steps];
  for (const { change } of applied) {
    for (const entry of change.steps) {
      const step = next[entry.number - 1];
      if (step) {
        next[entry.number - 1] = { ...step, text: entry.text, changed: true };
      }
    }
  }
  return next;
}

/** The line's amount for `servings` on the screen, as Готвене reads it (`scaleQuantity`). */
export function scaleCookingLine(line: CookingLine, servings: number): Amount {
  return scaleQuantity(line, line.servings, servings);
}
