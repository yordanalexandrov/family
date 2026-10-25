import { readFile } from 'node:fs/promises';
import { AISLES, createIngredientSchema } from '@family/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { testDb } from '../../test/db.js';
import { INGREDIENT_SEED_MIGRATION, ingredientSeedSql } from './ingredients.js';
import seed from './ingredients.json' with { type: 'json' };

async function ingredientNames(): Promise<string[]> {
  const { rows } = await testDb().execute<{ name: string }>(
    sql`select name from ingredient order by name`,
  );
  return rows.map((row) => row.name);
}

async function runSeedMigration(): Promise<void> {
  await testDb().$client.query(
    await readFile(INGREDIENT_SEED_MIGRATION, 'utf8'),
  );
}

describe('ingredient seed', () => {
  it('is loaded by the migrations: at least 140 ingredients, exactly those of ingredients.json', async () => {
    const names = await ingredientNames();

    expect(names.length).toBeGreaterThanOrEqual(140);
    expect(names).toEqual(
      seed.ingredients.map((ingredient) => ingredient.name).sort(),
    );
  });

  it('does not duplicate anything when the seed runs again', async () => {
    const before = await ingredientNames();

    await runSeedMigration();

    expect(await ingredientNames()).toEqual(before);
  });

  it('keeps a hand-made ingredient and adds only the missing ones on a re-run', async () => {
    await testDb().execute(sql`delete from ingredient where name = 'картоф'`);
    await testDb().execute(
      sql`insert into ingredient (name, unit, aisle) values ('джоджен', 'g', 'spices')`,
    );

    await runSeedMigration();

    const names = await ingredientNames();
    expect(names).toContain('картоф');
    expect(names).toContain('джоджен');
  });

  it('rejects a second ingredient with the same canonical name in other case or spacing', async () => {
    await expect(
      testDb().execute(
        sql`insert into ingredient (name, unit, aisle) values (' Картоф ', 'g', 'produce')`,
      ),
    ).rejects.toThrow();
  });

  it('rejects an aisle outside the fixed list', async () => {
    await expect(
      testDb().execute(
        sql`insert into ingredient (name, unit, aisle) values ('нахут', 'g', 'legumes')`,
      ),
    ).rejects.toThrow();
  });
});

describe('ingredients.json', () => {
  it('uses the aisles of @family/shared in the same order', () => {
    expect(seed.aisles).toEqual(AISLES);
  });

  it('holds only canonical, valid ingredients', () => {
    for (const ingredient of seed.ingredients) {
      expect(createIngredientSchema.parse(ingredient)).toEqual(ingredient);
    }
  });

  it('is what the seed migration inserts (regenerate with `pnpm --filter api db:seed-ingredients`)', async () => {
    expect(await readFile(INGREDIENT_SEED_MIGRATION, 'utf8')).toBe(
      ingredientSeedSql(
        seed.ingredients.map((ingredient) =>
          createIngredientSchema.parse(ingredient),
        ),
      ),
    );
  });
});
