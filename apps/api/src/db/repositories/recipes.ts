import type {
  MenuProposeRecipe,
  Recipe,
  RecipeIngredient,
  RecipeInput,
  RecipeLine,
  RecipeSummary,
  Slot,
} from '@family/shared';
import {
  and,
  arrayContains,
  asc,
  count,
  eq,
  ilike,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { likePattern } from '../like.js';
import { ingredient, recipe, recipeIngredient } from '../schema/food.js';
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
    ingredients,
    archivedAt: row.archivedAt?.toISOString() ?? null,
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

export async function listRecipes(
  db: DbExecutor,
  {
    q,
    tag,
    includeArchived,
  }: {
    q?: string;
    tag?: RecipeSummary['tags'][number];
    includeArchived: boolean;
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
    })
    .from(recipe)
    .where(
      and(
        q ? ilike(recipe.title, likePattern(q)) : undefined,
        tag ? arrayContains(recipe.tags, [tag]) : undefined,
        includeArchived ? undefined : isNull(recipe.archivedAt),
      ),
    )
    .orderBy(asc(recipe.title), asc(recipe.createdAt));
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
 * The recipes `menu.propose` chooses from: not archived, tagged with `slot`, by title, each with the names of its
 * products in line order.
 */
export async function listMenuRecipes(
  db: DbExecutor,
  slot: Slot,
): Promise<MenuProposeRecipe[]> {
  const rows = await db
    .select({
      id: recipe.id,
      title: recipe.title,
      prepMinutes: recipe.prepMinutes,
      tags: recipe.tags,
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
