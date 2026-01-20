import { defineConfig } from 'vitest/config';

/**
 * Shared Vitest Configuration
 *
 * This configuration is extended by all projects in vitest.workspace.ts.
 * It contains common settings for test execution and coverage.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
      include: ['**/src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/e2e/**',
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
  },
});
