import { defineConfig } from 'vitest/config';

// Note: This benchmark package runs locally in Node.js because it:
// 1. Downloads datasets from JSONBench using node:fs
// 2. Simulates worker behavior for performance testing
// 3. Measures local performance characteristics
//
// For actual workerd-based tests, see @evodb/core and @evodb/query packages
// which use @cloudflare/vitest-pool-workers to run in the workerd environment.

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 60000,
    // Limit concurrency to prevent excessive RAM usage
    maxConcurrency: 1,
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/__tests__/**'],
      thresholds: {
        // Increased from 70/65/70/70 after gap resolution
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 75,
      },
    },
  },
});
