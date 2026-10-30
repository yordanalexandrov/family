import proposeInput from '@family/shared/fixtures/menu-propose.input.json' with {
  type: 'json',
};
import { sql } from 'drizzle-orm';
import { ingredient, recipe, recipeIngredient } from '../db/schema/food.js';
import { testDb } from './db.js';

/**
 * The registry the recorded `menu.propose` fixture was made for: the 10 dinner recipes of `menu-propose.input.json`,
 * with their ids, so the recorded answer passes `validateProposal` as it is. Products the seed lacks are added.
 */
export async function seedFixtureRecipes(): Promise<void> {
  const db = testDb();
  for (const entry of proposeInput.recipes) {
    await db.insert(recipe).values({
      id: entry.id,
      title: entry.title,
      servings: 4,
      steps: [{ text: 'Сготви.' }],
      prepMinutes: entry.prepMinutes,
      tags: entry.tags as (typeof recipe.$inferInsert)['tags'],
      rating: entry.rating,
    });
    for (const [position, name] of entry.ingredientNames.entries()) {
      await db
        .insert(ingredient)
        .values({ name, unit: 'g', aisle: 'other' })
        .onConflictDoNothing();
      const [row] = await db
        .select({ id: ingredient.id })
        .from(ingredient)
        .where(sql`lower(${ingredient.name}) = ${name}`);
      await db.insert(recipeIngredient).values({
        recipeId: entry.id,
        ingredientId: row?.id ?? '',
        position,
        quantity: '100',
        unit: 'g',
      });
    }
  }
}
