/**
 * @evodb/test-utils - DI Container Integration Tests
 *
 * Tests demonstrating how to use the DI container with existing EvoDB patterns.
 * Shows real-world usage scenarios for test authors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  createContainer,
  createScope,
  createTestContainer,
  ServiceKeys,
  type Container,
  // Mock generators from test-utils
  createMockR2Bucket,
  createMockDOStorage,
  generatePartitionInfo,
  generateUsersSchema,
} from '../index.js';

// =============================================================================
// Integration with Mock R2 Bucket
// =============================================================================

describe('DI Container - R2 Bucket Integration', () => {
  let container: Container;

  beforeEach(() => {
    container = createContainer();
  });

  it('should allow injecting mock R2 bucket', async () => {
    const mockBucket = createMockR2Bucket();

    // Pre-populate with test data
    await mockBucket.put('test/file.json', JSON.stringify({ id: 1, name: 'test' }));

    container.registerValue(ServiceKeys.R2_BUCKET, mockBucket);

    const bucket = container.resolve<typeof mockBucket>(ServiceKeys.R2_BUCKET);
    const result = await bucket.get('test/file.json');

    expect(result).not.toBeNull();
    const data = await result!.json();
    expect(data).toEqual({ id: 1, name: 'test' });
  });

  it('should allow injecting mock DO storage', async () => {
    const mockStorage = createMockDOStorage();

    container.registerValue(ServiceKeys.DO_STORAGE, mockStorage);

    const storage = container.resolve<typeof mockStorage>(ServiceKeys.DO_STORAGE);

    await storage.put('state', { counter: 42 });
    const state = await storage.get<{ counter: number }>('state');

    expect(state?.counter).toBe(42);
  });
});

// =============================================================================
// Integration with Test Fixtures
// =============================================================================

describe('DI Container - Test Fixtures Integration', () => {
  it('should work with partition info generators', () => {
    const container = createContainer();

    // Register a mock zone map optimizer that uses partition info
    container.register(ServiceKeys.ZONE_MAP_OPTIMIZER, () => ({
      prunePartitions: (partitions: unknown[], predicates: unknown[]) => {
        // Mock implementation that prunes based on some simple logic
        if ((predicates as Array<{ column: string; value: number }>).some(p => p.column === 'age' && p.value > 50)) {
          return { selected: partitions, pruned: [] };
        }
        return { selected: partitions, pruned: [] };
      },
      estimateSelectivity: () => 0.5,
    }));

    const optimizer = container.resolve<{
      prunePartitions: (partitions: unknown[], predicates: unknown[]) => { selected: unknown[]; pruned: unknown[] };
    }>(ServiceKeys.ZONE_MAP_OPTIMIZER);

    // Use partition info generator
    const partitions = [
      generatePartitionInfo('data/p1.bin', 100, { age: { min: 18, max: 40, nullCount: 0 } }),
      generatePartitionInfo('data/p2.bin', 100, { age: { min: 40, max: 65, nullCount: 0 } }),
    ];

    const result = optimizer.prunePartitions(partitions, [{ column: 'age', value: 55 }]);

    expect(result.selected).toHaveLength(2);
  });

  it('should work with schema generators', () => {
    const container = createContainer();

    // Register configuration with generated schema
    const schema = generateUsersSchema();
    container.registerValue(ServiceKeys.CONFIG, { schema });

    const config = container.resolve<{ schema: typeof schema }>(ServiceKeys.CONFIG);

    expect(config.schema.columns).toHaveLength(5);
    expect(config.schema.columns[0].name).toBe('id');
  });
});

// =============================================================================
// Test Isolation Patterns
// =============================================================================

describe('DI Container - Test Isolation Patterns', () => {
  // Shared parent container with common configuration
  let sharedContainer: Container;

  beforeEach(() => {
    sharedContainer = createContainer();

    // Register common services
    sharedContainer.register(ServiceKeys.CACHE_MANAGER, () => ({
      isCached: () => Promise.resolve(false),
      getPartitionData: () => Promise.resolve({ data: null, fromCache: false }),
      getStats: () => ({ hits: 0, misses: 0, hitRatio: 0 }),
    }));

    sharedContainer.register(ServiceKeys.BLOOM_FILTER_MANAGER, () => ({
      mightContain: () => true,
      checkPredicate: () => true,
    }));
  });

  it('should allow test-specific overrides without affecting shared state', async () => {
    // Create test scope
    const testContainer = createScope(sharedContainer);

    // Override cache manager for this specific test
    testContainer.register(ServiceKeys.CACHE_MANAGER, () => ({
      isCached: () => Promise.resolve(true), // Everything is cached
      getPartitionData: () => Promise.resolve({ data: { rows: [] }, fromCache: true }),
      getStats: () => ({ hits: 100, misses: 0, hitRatio: 1.0 }),
    }));

    // Test uses cached version
    const cache = testContainer.resolve<{ isCached: () => Promise<boolean>; getStats: () => { hitRatio: number } }>(
      ServiceKeys.CACHE_MANAGER
    );
    expect(await cache.isCached()).toBe(true);
    expect(cache.getStats().hitRatio).toBe(1.0);

    // Shared container unchanged
    const sharedCache = sharedContainer.resolve<{ isCached: () => Promise<boolean> }>(ServiceKeys.CACHE_MANAGER);
    expect(await sharedCache.isCached()).toBe(false);
  });

  it('should support multiple independent test scopes', async () => {
    const test1Container = createScope(sharedContainer);
    const test2Container = createScope(sharedContainer);

    // Each test has its own override
    test1Container.register(ServiceKeys.BLOOM_FILTER_MANAGER, () => ({
      mightContain: () => true,
      checkPredicate: () => true,
    }));

    test2Container.register(ServiceKeys.BLOOM_FILTER_MANAGER, () => ({
      mightContain: () => false, // Always returns false for test 2
      checkPredicate: () => false,
    }));

    const bf1 = test1Container.resolve<{ mightContain: () => boolean }>(ServiceKeys.BLOOM_FILTER_MANAGER);
    const bf2 = test2Container.resolve<{ mightContain: () => boolean }>(ServiceKeys.BLOOM_FILTER_MANAGER);

    expect(bf1.mightContain()).toBe(true);
    expect(bf2.mightContain()).toBe(false);
  });
});

// =============================================================================
// createTestContainer Helper
// =============================================================================

describe('DI Container - createTestContainer Helper', () => {
  it('should provide pre-configured mocks', () => {
    const container = createTestContainer();

    // All standard services should be available
    expect(container.has(ServiceKeys.ZONE_MAP_OPTIMIZER)).toBe(true);
    expect(container.has(ServiceKeys.BLOOM_FILTER_MANAGER)).toBe(true);
    expect(container.has(ServiceKeys.CACHE_MANAGER)).toBe(true);
    expect(container.has(ServiceKeys.RESULT_PROCESSOR)).toBe(true);
  });

  it('should allow selective overrides', () => {
    const customZoneMapOptimizer = {
      prunePartitions: () => ({ selected: [], pruned: [] }), // Prunes everything
      estimateSelectivity: () => 0.0,
    };

    const container = createTestContainer({
      [ServiceKeys.ZONE_MAP_OPTIMIZER]: () => customZoneMapOptimizer,
    });

    const optimizer = container.resolve<typeof customZoneMapOptimizer>(ServiceKeys.ZONE_MAP_OPTIMIZER);

    expect(optimizer.prunePartitions().selected).toEqual([]);
    expect(optimizer.estimateSelectivity()).toBe(0.0);
  });

  it('should provide working result processor mock', () => {
    const container = createTestContainer();

    const processor = container.resolve<{
      sort: <T>(rows: T[], orderBy: unknown[]) => T[];
      limit: <T>(rows: T[], limit: number, offset?: number) => T[];
    }>(ServiceKeys.RESULT_PROCESSOR);

    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

    // Sort returns rows as-is (mock behavior)
    expect(processor.sort(rows, [])).toEqual(rows);

    // Limit works correctly
    expect(processor.limit(rows, 2)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(processor.limit(rows, 2, 2)).toEqual([{ id: 3 }, { id: 4 }]);
  });
});

// =============================================================================
// Spy/Mock Integration with vi.fn()
// =============================================================================

describe('DI Container - Vitest Spy Integration', () => {
  it('should work with vi.fn() for call tracking', async () => {
    const container = createContainer();

    const mockIsCached = vi.fn().mockResolvedValue(true);
    const mockPrefetch = vi.fn().mockResolvedValue(undefined);

    container.register(ServiceKeys.CACHE_MANAGER, () => ({
      isCached: mockIsCached,
      prefetch: mockPrefetch,
      getStats: () => ({ hits: 0, misses: 0, hitRatio: 0 }),
    }));

    const cache = container.resolve<{
      isCached: typeof mockIsCached;
      prefetch: typeof mockPrefetch;
    }>(ServiceKeys.CACHE_MANAGER);

    // Use the service
    await cache.isCached('partition-1');
    await cache.prefetch(['partition-1', 'partition-2']);

    // Verify calls
    expect(mockIsCached).toHaveBeenCalledTimes(1);
    expect(mockIsCached).toHaveBeenCalledWith('partition-1');
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    expect(mockPrefetch).toHaveBeenCalledWith(['partition-1', 'partition-2']);
  });

  it('should support changing mock behavior between calls', async () => {
    const container = createContainer();

    const mockMightContain = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    container.register(ServiceKeys.BLOOM_FILTER_MANAGER, () => ({
      mightContain: mockMightContain,
    }));

    const bf = container.resolve<{ mightContain: () => boolean }>(ServiceKeys.BLOOM_FILTER_MANAGER);

    expect(bf.mightContain()).toBe(true);
    expect(bf.mightContain()).toBe(false);
    expect(bf.mightContain()).toBe(true);
    expect(bf.mightContain()).toBe(true);
  });
});
