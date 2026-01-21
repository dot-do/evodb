import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { resolve } from 'path';

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Limit concurrency to prevent excessive RAM usage
    maxConcurrency: 1,
    fileParallelism: false,
    // Ensure tests use source files, not dist
    alias: {
      '../shred.js': resolve(__dirname, 'src/shred.ts'),
      '../index.js': resolve(__dirname, 'src/index.ts'),
      '../encode.js': resolve(__dirname, 'src/encode.ts'),
      '../errors.js': resolve(__dirname, 'src/errors.ts'),
      '../guards.js': resolve(__dirname, 'src/guards.ts'),
      '../string-intern-pool.js': resolve(__dirname, 'src/string-intern-pool.ts'),
      '../types.js': resolve(__dirname, 'src/types.ts'),
    },
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          compatibilityDate: '2024-01-01',
          compatibilityFlags: ['nodejs_compat'],
        },
        singleWorker: true,
      },
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
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
