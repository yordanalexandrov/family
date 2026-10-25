import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Recorded AI answers (shared fixtures) for specs that mock OpenClaw; never imported by the app.
      '@family/shared/fixtures': fileURLToPath(
        new URL(
          '../../packages/shared/src/contracts/fixtures',
          import.meta.url,
        ),
      ),
      '@family/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // All spec files share one test database, so they run one after another.
    fileParallelism: false,
  },
});
