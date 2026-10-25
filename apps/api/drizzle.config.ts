import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs from apps/api (`pnpm --filter api db:*`); the local .env lives at the repo root.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env: DATABASE_URL must come from the environment (only needed by db:migrate / db:studio).
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
