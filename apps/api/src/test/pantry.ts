import type { PantryKind } from '@family/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ingredient } from '../db/schema/food.js';
import { testDb } from './db.js';
import { DANI } from './users.js';

/**
 * Puts products in the pantry through `POST /api/pantry`, in the order given (so the first is the oldest). The
 * products are found by name, case-insensitively, and must exist.
 */
export async function stockPantry(
  app: FastifyInstance,
  items: { name: string; kind: PantryKind; note?: string }[],
): Promise<void> {
  for (const { name, kind, note } of items) {
    const [row] = await testDb()
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(sql`lower(${ingredient.name}) = ${name}`);
    if (!row) {
      throw new Error(`no ingredient ${name}`);
    }
    const response = await app.inject({
      method: 'POST',
      url: '/api/pantry',
      headers: { 'x-acting-user': DANI.id },
      payload: { ingredientId: row.id, kind, note },
    });
    if (response.statusCode !== 201) {
      throw new Error(
        `pantry ${name}: ${response.statusCode} ${response.body}`,
      );
    }
  }
}
