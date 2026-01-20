/**
 * Vitest Workspace Configuration
 *
 * Stratifies tests into three categories:
 * - unit: Fast, isolated tests (*.unit.test.ts)
 * - integration: Tests that integrate multiple modules (*.integration.test.ts)
 * - e2e: End-to-end tests (e2e directory)
 *
 * Usage:
 *   pnpm test:unit                    # Run only unit tests
 *   pnpm test:integration             # Run only integration tests
 *   pnpm test:e2e                     # Run only e2e tests
 *
 * From any workspace package with vitest:
 *   pnpm exec vitest run --project=unit
 *   pnpm exec vitest run --project=integration
 */
export default [
  {
    extends: './vitest.shared.ts',
    test: {
      name: 'unit',
      include: [
        'core/src/__tests__/**/*.unit.test.ts',
        'reader/src/__tests__/**/*.unit.test.ts',
        'writer/src/__tests__/**/*.unit.test.ts',
        'rpc/src/__tests__/**/*.unit.test.ts',
        'lakehouse/src/__tests__/**/*.unit.test.ts',
        'query/src/__tests__/**/*.unit.test.ts',
        'edge-cache/src/__tests__/**/*.unit.test.ts',
        'lance-reader/src/__tests__/**/*.unit.test.ts',
        'snippets-chain/src/__tests__/**/*.unit.test.ts',
        'snippets-lance/src/__tests__/**/*.unit.test.ts',
        'benchmark/src/__tests__/**/*.unit.test.ts',
        'codegen/src/__tests__/**/*.unit.test.ts',
        'test-utils/src/__tests__/**/*.unit.test.ts',
      ],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
  {
    extends: './vitest.shared.ts',
    test: {
      name: 'integration',
      include: [
        'core/src/__tests__/**/*.integration.test.ts',
        'reader/src/__tests__/**/*.integration.test.ts',
        'writer/src/__tests__/**/*.integration.test.ts',
        'rpc/src/__tests__/**/*.integration.test.ts',
        'lakehouse/src/__tests__/**/*.integration.test.ts',
        'query/src/__tests__/**/*.integration.test.ts',
        'edge-cache/src/__tests__/**/*.integration.test.ts',
        'lance-reader/src/__tests__/**/*.integration.test.ts',
        'snippets-chain/src/__tests__/**/*.integration.test.ts',
        'snippets-lance/src/__tests__/**/*.integration.test.ts',
        'benchmark/src/__tests__/**/*.integration.test.ts',
        'codegen/src/__tests__/**/*.integration.test.ts',
        'test-utils/src/__tests__/**/*.integration.test.ts',
      ],
      exclude: ['**/node_modules/**', '**/dist/**'],
      // Integration tests may need more time
      testTimeout: 15000,
    },
  },
  {
    extends: './vitest.shared.ts',
    test: {
      name: 'e2e',
      include: ['e2e/src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      // E2E tests typically need more time
      testTimeout: 30000,
    },
  },
];
