import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Shared Vitest Configuration
 *
 * This configuration is extended by all projects in vitest.workspace.ts.
 * It contains common settings for test execution and coverage.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Core module aliases for workspace tests - resolve .js to .ts
      // These handle imports from test files to source files
      '../validation.js': resolve(__dirname, 'core/src/validation.ts'),
      '../schemas.js': resolve(__dirname, 'core/src/schemas.ts'),
      '../errors.js': resolve(__dirname, 'core/src/errors.ts'),
      '../backup.js': resolve(__dirname, 'core/src/backup.ts'),
      '../import-export.js': resolve(__dirname, 'core/src/import-export.ts'),
      // These handle internal imports within source files (relative to core/src)
      './stack-trace.js': resolve(__dirname, 'core/src/stack-trace.ts'),
      './errors.js': resolve(__dirname, 'core/src/errors.ts'),
      './validation.js': resolve(__dirname, 'core/src/validation.ts'),
      './schemas.js': resolve(__dirname, 'core/src/schemas.ts'),
    },
  },
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
