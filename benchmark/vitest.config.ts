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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/__tests__/**'],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
  },
});
