import {
  canonicalTitle,
  type DuplicateOf,
  type MenuProposeRecipe,
  PREP_TIME_RANGES,
  type PrepTimeRange,
  type Rating,
  type Recipe,
  type RecipeIngredient,
  type RecipeInput,
  type RecipeLine,
  type RecipeSummary,
  type RecipesSort,
  type Slot,
  slotSchema,
  type Tag,
} from '@family/shared';
import {
  and,
  arrayContains,
  arrayOverlaps,
  asc,
  count,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { likePattern } from '../like.js';
import { ingredient, recipe, recipeIngredient } from '../schema/food.js';
import { meal } from '../schema/menu.js';
import { ingredientColumns } from './ingredients.js';

type RecipeRow = typeof recipe.$inferSelect;

/** API shape of a stored recipe: DB nulls of optional fields become absent, dates ISO strings. */
function toRecipe(row: RecipeRow, ingredients: RecipeLine[]): Recipe {
  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    steps: row.steps,
    sourceUrl: row.sourceUrl ?? undefined,
    prepMinutes: row.prepMinutes ?? undefined,
    tags: row.tags,
    nutritionPer100g: row.nutritionPer100g ?? undefined,
    appliance: row.appliance ?? undefined,
    preparation: row.preparation,
    ingredients,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    rating: row.rating,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The recipe columns that come from `RecipeInput`; the ingredient lines live in `recipe_ingredient`. */
function recipeValues(input: RecipeInput) {
  return {
    title: input.title,
    servings: input.servings,
    steps: input.steps,
    sourceUrl: input.sourceUrl ?? null,
    prepMinutes: input.prepMinutes ?? null,
    tags: input.tags,
    nutritionPer100g: input.nutritionPer100g ?? null,
    appliance: input.appliance ?? null,
    preparation: input.preparation,
  };
}

export async function findRecipe(
  db: DbExecutor,
  id: string,
): Promise<Recipe | undefined> {
  const [row] = await db
    .select()
    .from(recipe)
    .where(eq(recipe.id, id))
    .limit(1);
  if (!row) {
    return undefined;
  }
  const lines = await db
    .select({
      ingredientId: recipeIngredient.ingredientId,
      // numeric comes back from pg as a string.
      quantity: recipeIngredient.quantity,
      unit: recipeIngredient.unit,
      note: recipeIngredient.note,
      ingredient: ingredientColumns,
    })
    .from(recipeIngredient)
    .innerJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
    .where(eq(recipeIngredient.recipeId, id))
    .orderBy(asc(recipeIngredient.position));
  return toRecipe(
    row,
    lines.map((line) => ({
      ...line,
      quantity: line.quantity === null ? null : Number(line.quantity),
      note: line.note ?? undefined,
    })),
  );
}

/** Slot tags match any of them (обяд или вечеря), the other tags all of them. */
function tagsFilter(tags: readonly Tag[]): SQL | undefined {
  const isSlot = (tag: Tag) =>
    (slotSchema.options as readonly string[]).includes(tag);
  const slots = tags.filter(isSlot);
  const others = tags.filter((tag) => !isSlot(tag));
  return and(
    slots.length > 0 ? arrayOverlaps(recipe.tags, slots) : undefined,
    others.length > 0 ? arrayContains(recipe.tags, others) : undefined,
  );
}

/** Prep time in any of the intervals; a recipe without a time does not match. */
function timeFilter(ranges: readonly PrepTimeRange[]): SQL | undefined {
  return or(
    ...ranges.map((range) => {
      const { above, upTo } = PREP_TIME_RANGES[range];
      return and(
        gt(recipe.prepMinutes, above),
        upTo === null ? undefined : lte(recipe.prepMinutes, upTo),
      );
    }),
  );
}

export async function listRecipes(
  db: DbExecutor,
  {
    q,
    tag = [],
    time = [],
    includeArchived,
    sort = 'title',
  }: {
    q?: string;
    tag?: readonly Tag[];
    time?: readonly PrepTimeRange[];
    includeArchived: boolean;
    sort?: RecipesSort;
  },
): Promise<RecipeSummary[]> {
  const rows = await db
    .select({
      id: recipe.id,
      title: recipe.title,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      tags: recipe.tags,
      archivedAt: recipe.archivedAt,
      rating: recipe.rating,
    })
    .from(recipe)
    .where(
      and(
        q ? ilike(recipe.title, likePattern(q)) : undefined,
        tagsFilter(tag),
        timeFilter(time),
        includeArchived ? undefined : isNull(recipe.archivedAt),
      ),
    )
    .orderBy(
      ...(sort === 'rating' ? [sql`${recipe.rating} desc nulls last`] : []),
      asc(recipe.title),
      asc(recipe.createdAt),
    );
  return rows.map((row) => ({
    ...row,
    prepMinutes: row.prepMinutes ?? undefined,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  }));
}

/** Inserts the recipe row only; returns its id. */
export async function insertRecipe(
  db: DbExecutor,
  input: RecipeInput,
): Promise<string> {
  const [row] = await db
    .insert(recipe)
    .values(recipeValues(input))
    .returning({ id: recipe.id });
  if (!row) {
    throw new Error('insert into recipe returned no row');
  }
  return row.id;
}

/** Overwrites the recipe row (not its lines) and bumps `updated_at`; `false` when there is no such recipe. */
export async function updateRecipe(
  db: DbExecutor,
  id: string,
  input: RecipeInput,
): Promise<boolean> {
  const rows = await db
    .update(recipe)
    .set({ ...recipeValues(input), updatedAt: new Date() })
    .where(eq(recipe.id, id))
    .returning({ id: recipe.id });
  return rows.length > 0;
}

/**
 * Archives (keeping an earlier `archived_at`) or brings back the recipe; `updated_at` moves only when the state changes.
 * A no-op for an unknown id.
 */
export async function setRecipeArchivedAt(
  db: DbExecutor,
  id: string,
  archived: boolean,
): Promise<void> {
  await db
    .update(recipe)
    .set({
      archivedAt: archived ? sql`now()` : null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(recipe.id, id),
        archived ? isNull(recipe.archivedAt) : isNotNull(recipe.archivedAt),
      ),
    );
}

/**
 * Sets (`1..5`) or clears (`null`) the family's rating; `updated_at` stays, a rating is not an edit of the recipe.
 * `false` when there is no such recipe.
 */
export async function setRecipeRating(
  db: DbExecutor,
  id: string,
  rating: Rating | null,
): Promise<boolean> {
  const rows = await db
    .update(recipe)
    .set({ rating })
    .where(eq(recipe.id, id))
    .returning({ id: recipe.id });
  return rows.length > 0;
}

/** Replaces all ingredient lines of a recipe, numbered in the given order; run it in a transaction. */
export async function replaceRecipeIngredients(
  db: DbExecutor,
  recipeId: string,
  lines: RecipeIngredient[],
): Promise<void> {
  await db
    .delete(recipeIngredient)
    .where(eq(recipeIngredient.recipeId, recipeId));
  if (lines.length === 0) {
    return;
  }
  await db.insert(recipeIngredient).values(
    lines.map((line, position) => ({
      recipeId,
      ingredientId: line.ingredientId,
      position,
      quantity: line.quantity === null ? null : String(line.quantity),
      unit: line.unit,
      note: line.note ?? null,
    })),
  );
}

/** Titles of the recipes that are not archived: the registry context of `recipe.suggest`. */
export async function listActiveRecipeTitles(
  db: DbExecutor,
): Promise<string[]> {
  const rows = await db
    .select({ title: recipe.title })
    .from(recipe)
    .where(isNull(recipe.archivedAt))
    .orderBy(asc(recipe.title));
  return rows.map((row) => row.title);
}

/**
 * The recipes that are not archived, by canonical title (trimmed, lower case, single spaces, as the names of products),
 * the oldest of a title first; for the `duplicateOf` of proposed suggestions. Few rows, so compared here, not in SQL.
 */
export async function listActiveRecipesByTitle(
  db: DbExecutor,
): Promise<Map<string, DuplicateOf>> {
  const rows = await db
    .select({ id: recipe.id, title: recipe.title })
    .from(recipe)
    .where(isNull(recipe.archivedAt))
    .orderBy(asc(recipe.createdAt), asc(recipe.id));
  const byTitle = new Map<string, DuplicateOf>();
  for (const row of rows) {
    const key = canonicalTitle(row.title);
    if (!byTitle.has(key)) {
      byTitle.set(key, row);
    }
  }
  return byTitle;
}

/** Whether the recipe exists, is not archived and is tagged with `slot`, i.e. may be picked for a meal of that slot. */
export async function isMenuRecipe(
  db: DbExecutor,
  id: string,
  slot: Slot,
): Promise<boolean> {
  const [row] = await db
    .select({ id: recipe.id })
    .from(recipe)
    .where(
      and(
        eq(recipe.id, id),
        isNull(recipe.archivedAt),
        arrayContains(recipe.tags, [slot]),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The recipes `menu.propose` and `meal.replace` choose from: not archived, tagged with `slot`, by title, each with the
 * names of its products in line order, its rating and the date of its latest meal strictly before `before`: the
 * proposed week's Monday, or the date of the meal being replaced. A meal planned before that date counts as served,
 * also when its day is still to come.
 */
export async function listMenuRecipes(
  db: DbExecutor,
  slot: Slot,
  before: string,
): Promise<MenuProposeRecipe[]> {
  const rows = await db
    .select({
      id: recipe.id,
      title: recipe.title,
      prepMinutes: recipe.prepMinutes,
      tags: recipe.tags,
      rating: recipe.rating,
      lastServedOn: sql<string | null>`(
        select max(${meal.date})::text from ${meal}
        where ${meal.recipeId} = ${recipe.id} and ${meal.date} < ${before}
      )`,
      ingredientNames: sql<string[]>`coalesce(
        array_agg(${ingredient.name} order by ${recipeIngredient.position})
          filter (where ${ingredient.id} is not null),
        '{}'
      )`,
    })
    .from(recipe)
    .leftJoin(recipeIngredient, eq(recipeIngredient.recipeId, recipe.id))
    .leftJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
    .where(and(isNull(recipe.archivedAt), arrayContains(recipe.tags, [slot])))
    .groupBy(recipe.id)
    .orderBy(asc(recipe.title), asc(recipe.id));
  return rows.map((row) => ({
    ...row,
    prepMinutes: row.prepMinutes ?? undefined,
    rating: row.rating ?? undefined,
    lastServedOn: row.lastServedOn ?? undefined,
  }));
}

/** How many recipes `menu.propose` could choose from for `slot` (see {@link listMenuRecipes}). */
export async function countMenuRecipes(
  db: DbExecutor,
  slot: Slot,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(recipe)
    .where(and(isNull(recipe.archivedAt), arrayContains(recipe.tags, [slot])));
  return row?.count ?? 0;
}
