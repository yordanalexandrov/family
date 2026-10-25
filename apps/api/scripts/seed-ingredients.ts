// Regenerates drizzle/0003_seed_ingredients.sql from src/db/seed/ingredients.json.
import { writeFile } from 'node:fs/promises';
import { createIngredientSchema } from '@family/shared';
import { z } from 'zod';
import {
  INGREDIENT_SEED_MIGRATION,
  ingredientSeedSql,
} from '../src/db/seed/ingredients.js';
import seed from '../src/db/seed/ingredients.json' with { type: 'json' };

const ingredients = z.array(createIngredientSchema).parse(seed.ingredients);
await writeFile(INGREDIENT_SEED_MIGRATION, ingredientSeedSql(ingredients));
process.stdout.write(
  `${ingredients.length} ingredients → ${INGREDIENT_SEED_MIGRATION}\n`,
);
