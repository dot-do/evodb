import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@evodb/core': path.resolve(__dirname, '../core/dist/index.js'),
      '@evodb/rpc': path.resolve(__dirname, '../rpc/dist/index.js'),
      '@evodb/lakehouse': path.resolve(__dirname, '../lakehouse/dist/index.js'),
      '@evodb/test-utils': path.resolve(__dirname, '../test-utils/dist/index.js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
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
