// Writes the ingredients of src/db/seed/ingredients.json that no seed migration inserts yet into a new, empty
// custom migration. Applied migrations are never rewritten (see src/db/seed/ingredients.ts):
//   pnpm --filter api db:generate --custom --name seed_ingredients_<what>
//   pnpm --filter api db:seed-ingredients -- <tag printed by the first command, e.g. 0007_seed_ingredients_spices>
import { readFile, writeFile } from 'node:fs/promises';
import { createIngredientSchema } from '@family/shared';
import { z } from 'zod';
import {
  ingredientSeedSql,
  seededIngredientNames,
} from '../src/db/seed/ingredients.js';
import seed from '../src/db/seed/ingredients.json' with { type: 'json' };
import {
  ingredientSeedMigrations,
  isEmptyMigration,
} from '../src/db/seed/migrations.js';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const ingredients = z.array(createIngredientSchema).parse(seed.ingredients);
const migrations = await ingredientSeedMigrations();
const target = process.argv.slice(2).find((arg) => arg !== '--');

const seeded = new Set<string>();
let targetMigration: (typeof migrations)[number] | undefined;
for (const migration of migrations) {
  const sql = await readFile(migration.path, 'utf8');
  if (migration.tag === target) {
    if (!isEmptyMigration(sql)) {
      fail(
        `${migration.tag} already has SQL; an applied migration is never rewritten. Make a new one with db:generate --custom.`,
      );
    }
    targetMigration = migration;
  }
  for (const name of seededIngredientNames(sql)) {
    seeded.add(name);
  }
}

const missing = ingredients.filter(
  (ingredient) => !seeded.has(ingredient.name),
);
if (missing.length === 0) {
  process.stdout.write('Every ingredient is in a seed migration already.\n');
  process.exit(0);
}
if (!targetMigration) {
  fail(
    `${missing.length} ingredients are in no seed migration yet. Create an empty one and pass its tag:\n` +
      '  pnpm --filter api db:generate --custom --name seed_ingredients_<what>\n' +
      '  pnpm --filter api db:seed-ingredients -- <tag>',
  );
}
await writeFile(targetMigration.path, ingredientSeedSql(missing));
process.stdout.write(
  `${missing.length} ingredients → ${targetMigration.path}\n`,
);
