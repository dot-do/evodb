import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@evodb/graphql',
    include: ['src/__tests__/**/*.test.ts'],
    globals: true,
    testTimeout: 10000,
  },
});
