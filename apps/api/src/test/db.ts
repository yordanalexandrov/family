/** The throwaway Postgres from `docker compose --profile test up -d postgres-test`. */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://family:test@127.0.0.1:5433/family';
