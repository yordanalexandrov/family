import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** The migrations in `drizzle/` as the journal lists them; seed migrations are found by tag. */

const DRIZZLE_DIR = new URL('../../../drizzle/', import.meta.url);

/** Tags of the ingredient seed migrations: `0003_seed_ingredients`, later `0007_seed_ingredients_spices` and so on. */
const SEED_INGREDIENTS_TAG = /^\d{4}_seed_ingredients(_\w+)?$/;

/** The data migrations (users, ingredients): idempotent, so the specs re-run them after every test. */
const DATA_MIGRATION_TAG = /^\d{4}_seed_\w+$/;

export interface SeedMigration {
  tag: string;
  path: string;
}

/** Path of the migration file `<tag>.sql`. */
export function migrationPath(tag: string): string {
  return fileURLToPath(new URL(`${tag}.sql`, DRIZZLE_DIR));
}

async function journalTags(): Promise<string[]> {
  const journal = JSON.parse(
    await readFile(new URL('meta/_journal.json', DRIZZLE_DIR), 'utf8'),
  ) as { entries: { tag: string }[] };
  return journal.entries.map((entry) => entry.tag);
}

async function migrationsMatching(pattern: RegExp): Promise<SeedMigration[]> {
  return (await journalTags())
    .filter((tag) => pattern.test(tag))
    .map((tag) => ({ tag, path: migrationPath(tag) }));
}

/** The ingredient seed migrations in the order Drizzle applies them. */
export function ingredientSeedMigrations(): Promise<SeedMigration[]> {
  return migrationsMatching(SEED_INGREDIENTS_TAG);
}

/** Every data migration (`<n>_seed_*`) in the order Drizzle applies them. */
export function dataMigrations(): Promise<SeedMigration[]> {
  return migrationsMatching(DATA_MIGRATION_TAG);
}

/** `true` when `sql` is only comments and blank lines, as `drizzle-kit generate --custom` leaves a new migration. */
export function isEmptyMigration(sql: string): boolean {
  return sql
    .split('\n')
    .every((line) => line.trim() === '' || line.trim().startsWith('--'));
}
