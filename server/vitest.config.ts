import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // All server tests share one Postgres database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
