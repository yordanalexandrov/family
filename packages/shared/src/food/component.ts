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
 * `components` as the agent writes it under strict structured outputs: every property required, no default. Only for
 * a contract's JSON Schema.
 */
export const recipeComponentsWireSchema = z.array(recipeComponentSchema);

/** The index of a component in `components` (from 0), as an ingredient line points to it. */
export const componentIndexSchema = z.int().min(0);

/**
 * `component` of an ingredient line as the agent writes it under strict structured outputs: the index, `null` for a
 * main line. Only for a contract's JSON Schema.
 */
export const lineComponentWireSchema = componentIndexSchema.nullable();

/**
 * The `component` of an ingredient line: the index of its component in `components`, `null` (or absent) for a main
 * line.
 */
export const lineComponentSchema = lineComponentWireSchema.default(null);

/**
 * The counters of a recipe's components in Готвене (GLOSSARY: Компонент), by index: whole servings, at most
 * {@link COMPONENTS_MAX}.
 */
export const componentCountersSchema = z
  .array(z.int().min(1))
  .max(COMPONENTS_MAX);

/**
 * Object-level rules for a recipe-shaped object with components: every line's `component` is an index of
 * `components` and every component has at least one line. Use with `.superRefine(checkComponents)` on any schema
 * (recipe, AI contract) that carries `components` and lines with `component`; an AI contract whose recipe is nested
 * calls it with the recipe's path (`at`), so the issue goes back to the agent where it is. The messages are for the
 * agent's retry; forms show their own.
 */
export function checkComponents(
  value: {
    components: readonly unknown[];
    ingredients: readonly { component?: number | null | undefined }[];
  },
  ctx: z.RefinementCtx,
  at: readonly (string | number)[] = [],
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
        path: [...at, 'ingredients', index, 'component'],
        message: `Няма компонент ${component}: component е индекс в components (от 0) или null за главен ред.`,
      });
      return;
    }
    used.add(component);
  });
  value.components.forEach((_, index) => {
    if (!used.has(index)) {
      ctx.addIssue({
        code: 'custom',
        path: [...at, 'components', index],
        message: `Компонент ${index} е без продукти: всеки компонент има поне един ред с неговия индекс в component.`,
      });
    }
  });
}

/**
 * {@link checkComponents} for the recipe of a contract's input or answer, at `recipe`; nothing when there is no recipe
 * (an answer with `noResults`).
 */
export function checkRecipeComponents(
  value: {
    recipe: Parameters<typeof checkComponents>[0] | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.recipe) {
    checkComponents(value.recipe, ctx, ['recipe']);
  }
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

/**
 * The servings of `component` for `servings` of the recipe when nobody set them by hand: whole batches
 * (`batches`) times the component's servings. Готвене's component counter starts there.
 */
export function defaultComponentServings(
  servings: number,
  component: { servings: number },
): number {
  return batches(servings, component) * component.servings;
}

/**
 * A component's counter in Готвене for `servings` of the recipe: `set` when someone set it (by hand, or the one a
 * question was asked at), otherwise the one it starts with ({@link defaultComponentServings}).
 */
export function componentCounter(
  servings: number,
  component: { servings: number },
  set?: number | null,
): number {
  return set ?? defaultComponentServings(servings, component);
}

/**
 * The lines of a recipe-shaped object by component (GLOSSARY: Компонент), each group in the order of `lines`: `main`
 * the main lines (and any whose component is not one of the `count` components), `components[i]` the lines of the
 * component `i`. `componentOf` reads a line's component index (`null` or `undefined` for a main line).
 */
export function linesByComponent<Line>(
  lines: readonly Line[],
  count: number,
  componentOf: (line: Line) => number | null | undefined,
): { main: Line[]; components: Line[][] } {
  const main: Line[] = [];
  const components = Array.from({ length: count }, (): Line[] => []);
  for (const line of lines) {
    const index = componentOf(line);
    const group =
      index === null || index === undefined ? undefined : components[index];
    (group ?? main).push(line);
  }
  return { main, components };
}
