import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AISLES, createIngredientSchema } from '@family/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { testDb } from '../../test/db.js';
import { seededIngredientNames } from './ingredients.js';
import seed from './ingredients.json' with { type: 'json' };
import {
  ingredientSeedMigrations,
  isEmptyMigration,
  migrationPath,
} from './migrations.js';

async function ingredientNames(): Promise<string[]> {
  const { rows } = await testDb().execute<{ name: string }>(
    sql`select name from ingredient order by name`,
  );
  return rows.map((row) => row.name);
}

async function runSeedMigration(): Promise<void> {
  for (const migration of await ingredientSeedMigrations()) {
    await testDb().$client.query(await readFile(migration.path, 'utf8'));
  }
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

  it('is inserted by the seed migrations, each ingredient by exactly one (add new ones with `pnpm --filter api db:seed-ingredients`)', async () => {
    const seeded: string[] = [];
    for (const migration of await ingredientSeedMigrations()) {
      seeded.push(
        ...seededIngredientNames(await readFile(migration.path, 'utf8')),
      );
    }

    expect(seeded.sort()).toEqual(
      seed.ingredients.map((ingredient) => ingredient.name).sort(),
    );
  });
});

describe('seed migrations', () => {
  it('keeps 0003_seed_ingredients as it was applied: new seed ingredients go into a new migration', async () => {
    const content = await readFile(
      migrationPath('0003_seed_ingredients'),
      'utf8',
    );

    expect(createHash('sha256').update(content).digest('hex')).toBe(
      'b5b87dcc00765dc0310b4913246a976a9ae16b04a8015a4fff69ccb195822040',
    );
  });

  it('reads back the names of a generated migration, quotes included', () => {
    const generated = [
      'INSERT INTO "ingredient" ("name", "unit", "aisle") VALUES',
      "('лук', 'pcs', 'produce'),",
      "('o''brien', 'g', 'other')",
      'ON CONFLICT DO NOTHING;',
    ].join('\n');

    expect(seededIngredientNames(generated)).toEqual(['лук', "o'brien"]);
  });

  it('treats a fresh custom migration as empty and a generated one as not', () => {
    expect(
      isEmptyMigration(
        '-- Custom SQL migration file, put your code below! --\n',
      ),
    ).toBe(true);
    expect(isEmptyMigration("INSERT INTO x VALUES ('a');")).toBe(false);
  });
});
