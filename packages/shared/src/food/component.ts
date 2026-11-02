import { z } from 'zod';

/** At most this many components (GLOSSARY: Компонент) in one recipe. */
export const COMPONENTS_MAX = 3;

/** A component's name is 1–40 characters („Песто“, „Тесто за две пици“). */
export const COMPONENT_NAME_MAX = 40;

/**
 * A part of a recipe made as its own batch with its own servings (GLOSSARY: Компонент, ADR-0012): „Песто · за 5
 * порции“. Its lines are the recipe's ingredient lines whose `component` is its index in `components`.
 */
export const recipeComponentSchema = z.object({
  name: z.string().trim().min(1).max(COMPONENT_NAME_MAX),
  servings: z.int().min(1),
});

export type RecipeComponent = z.infer<typeof recipeComponentSchema>;

/** `components` of a recipe-shaped object: at most {@link COMPONENTS_MAX}, `[]` when absent (a recipe without any). */
export const recipeComponentsSchema = z
  .array(recipeComponentSchema)
  .max(COMPONENTS_MAX)
  .default([]);

/**
 * The `component` of an ingredient line: the index of its component in `components`, `null` (or absent) for a main
 * line.
 */
export const lineComponentSchema = z.int().min(0).nullable().default(null);

/**
 * Object-level rules for a recipe-shaped object with components: every line's `component` is an index of
 * `components` and every component has at least one line. Use with `.superRefine(checkComponents)` on any schema
 * (recipe, AI contract) that carries `components` and lines with `component`.
 */
export function checkComponents(
  value: {
    components: readonly unknown[];
    ingredients: readonly { component?: number | null | undefined }[];
  },
  ctx: z.RefinementCtx,
): void {
  const used = new Set<number>();
  value.ingredients.forEach((line, index) => {
    const component = line.component ?? null;
    if (component === null) {
      return;
    }
    if (component >= value.components.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['ingredients', index, 'component'],
        message: 'No such component',
      });
      return;
    }
    used.add(component);
  });
  value.components.forEach((_, index) => {
    if (!used.has(index)) {
      ctx.addIssue({
        code: 'custom',
        path: ['components', index],
        message: 'A component has at least one line',
      });
    }
  });
}

/**
 * Whole batches of `component` that make at least `servings` (ADR-0012): pesto for 5 is 1 batch for a meal for 4
 * and 2 for a meal for 7.
 */
export function batches(
  servings: number,
  component: Pick<RecipeComponent, 'servings'>,
): number {
  return Math.ceil(servings / component.servings);
}
