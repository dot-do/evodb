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
      // Root level modules (for submodule internal imports)
      '../shred.js': resolve(__dirname, 'src/shred.ts'),
      '../index.js': resolve(__dirname, 'src/index.ts'),
      '../encode.js': resolve(__dirname, 'src/encode.ts'),
      '../errors.js': resolve(__dirname, 'src/errors.ts'),
      '../guards.js': resolve(__dirname, 'src/guards.ts'),
      '../string-intern-pool.js': resolve(__dirname, 'src/string-intern-pool.ts'),
      '../types.js': resolve(__dirname, 'src/types.ts'),
      '../query-ops.js': resolve(__dirname, 'src/query-ops.ts'),
      '../storage.js': resolve(__dirname, 'src/storage.ts'),
      '../storage-provider.js': resolve(__dirname, 'src/storage-provider.ts'),
      '../circuit-breaker.js': resolve(__dirname, 'src/circuit-breaker.ts'),
      '../block.js': resolve(__dirname, 'src/block.ts'),
      '../wal.js': resolve(__dirname, 'src/wal.ts'),
      '../schema.js': resolve(__dirname, 'src/schema.ts'),
      '../merge.js': resolve(__dirname, 'src/merge.ts'),
      '../partition.js': resolve(__dirname, 'src/partition.ts'),
      '../snippet.js': resolve(__dirname, 'src/snippet.ts'),
      '../constants.js': resolve(__dirname, 'src/constants.ts'),
      '../evodb.js': resolve(__dirname, 'src/evodb.ts'),
      '../query-builder.js': resolve(__dirname, 'src/query-builder.ts'),
      '../query-executor.js': resolve(__dirname, 'src/query-executor.ts'),
      '../query-engine-selector.js': resolve(__dirname, 'src/query-engine-selector.ts'),
      '../logging-types.js': resolve(__dirname, 'src/logging-types.ts'),
      '../tracing-types.js': resolve(__dirname, 'src/tracing-types.ts'),
      '../stack-trace.js': resolve(__dirname, 'src/stack-trace.ts'),
      // Submodule entry points for focused imports (Issue evodb-9s8)
      '../../types/index.js': resolve(__dirname, 'src/types/index.ts'),
      '../../encoding/index.js': resolve(__dirname, 'src/encoding/index.ts'),
      '../../shredding/index.js': resolve(__dirname, 'src/shredding/index.ts'),
      '../../query/index.js': resolve(__dirname, 'src/query/index.ts'),
      '../../storage/index.js': resolve(__dirname, 'src/storage/index.ts'),
      '../../errors/index.js': resolve(__dirname, 'src/errors/index.ts'),
      '../../constants/index.js': resolve(__dirname, 'src/constants/index.ts'),
      '../../guards/index.js': resolve(__dirname, 'src/guards/index.ts'),
      '../../evodb/index.js': resolve(__dirname, 'src/evodb/index.ts'),
      '../../block/index.js': resolve(__dirname, 'src/block/index.ts'),
      '../../wal/index.js': resolve(__dirname, 'src/wal/index.ts'),
      '../../schema/index.js': resolve(__dirname, 'src/schema/index.ts'),
      '../../merge/index.js': resolve(__dirname, 'src/merge/index.ts'),
      '../../partition/index.js': resolve(__dirname, 'src/partition/index.ts'),
      '../../snippet/index.js': resolve(__dirname, 'src/snippet/index.ts'),
      '../../logging/index.js': resolve(__dirname, 'src/logging/index.ts'),
      '../../tracing/index.js': resolve(__dirname, 'src/tracing/index.ts'),
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
