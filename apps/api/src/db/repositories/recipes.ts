import type {
  Recipe,
  RecipeIngredient,
  RecipeInput,
  RecipeLine,
  RecipeSummary,
} from '@family/shared';
import { and, arrayContains, asc, eq, ilike, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../client.js';
import { ingredient, recipe, recipeIngredient } from '../schema/food.js';
import { likePattern } from './ingredients.js';

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
      ingredient: {
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        aisle: ingredient.aisle,
      },
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

/** Sets or clears `archived_at`; `false` when there is no such recipe. */
export async function setRecipeArchivedAt(
  db: DbExecutor,
  id: string,
  archivedAt: Date | null,
): Promise<boolean> {
  const rows = await db
    .update(recipe)
    .set({ archivedAt, updatedAt: new Date() })
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
