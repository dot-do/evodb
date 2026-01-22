import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Limit concurrency to prevent excessive RAM usage
    maxConcurrency: 1,
    fileParallelism: false,
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
        // Increased from 70/65/70/70 after gap resolution
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 75,
      },
    },
  },
});
