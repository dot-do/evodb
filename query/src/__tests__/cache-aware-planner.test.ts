/**
 * Tests for Cache-Aware Query Planning
 *
 * TDD: These tests are written first to define the expected behavior
 * of the cache-aware query planner, which considers cached data when
 * planning queries and prefers queries that can use cached blocks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CacheAwareQueryPlanner,
  type CacheAwarePlanConfig,
  type CacheAwarePlan,
  type CacheAwarePlanStats,
} from '../cache-aware-planner.js';
import type { PartitionInfo, Query, QueryEngineConfig, R2Bucket } from '../types.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockBucket(): R2Bucket {
  return {
    get: async (key: string) => ({
      arrayBuffer: async () => new ArrayBuffer(100),
      key,
      version: '1',
      size: 100,
      etag: 'etag',
      httpEtag: '"etag"',
      checksums: {},
      uploaded: new Date(),
      httpMetadata: {},
      customMetadata: {},
      writeHttpMetadata: () => {},
    }),
    put: async () => null,
    delete: async () => {},
    list: async () => ({ objects: [], truncated: false, cursor: undefined }),
    head: async () => null,
  } as unknown as R2Bucket;
}

function createTestConfig(cacheAwareConfig?: Partial<CacheAwarePlanConfig>): QueryEngineConfig & { cacheAwarePlanning?: CacheAwarePlanConfig } {
  return {
    bucket: createMockBucket(),
    cache: {
      enabled: true,
      ttlSeconds: 3600,
      maxSizeBytes: 1024 * 1024,
      maxEntries: 1000,
      keyPrefix: 'test:',
    },
    cacheAwarePlanning: {
      enabled: true,
      cacheWeightFactor: 0.5, // 50% cost reduction for cached blocks
      maxReorderDistance: 3,  // Allow reordering within 3 positions
      prefetchThreshold: 0.7, // Prefetch if 70% of blocks are cached
      ...cacheAwareConfig,
    },
  };
}

function createPartition(
  path: string,
  options: {
    isCached?: boolean;
    sizeBytes?: number;
    rowCount?: number;
    cacheKey?: string;
    zoneMapMin?: number;
    zoneMapMax?: number;
  } = {}
): PartitionInfo {
  const { isCached = false, sizeBytes = 10000, rowCount = 100, cacheKey, zoneMapMin = 1, zoneMapMax = 100 } = options;
  return {
    path,
    partitionValues: {},
    sizeBytes,
    rowCount,
    zoneMap: {
      columns: {
        id: { min: zoneMapMin, max: zoneMapMax, nullCount: 0, allNull: false },
      },
    },
    isCached,
    cacheKey,
  };
}

function createTestQuery(table: string = 'test_table'): Query {
  return {
    table,
    projection: { columns: ['id', 'name'] },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('CacheAwareQueryPlanner', () => {
  describe('basic functionality', () => {
    it('should create a cache-aware planner with config', () => {
      const config = createTestConfig();
      const planner = new CacheAwareQueryPlanner(config);

      expect(planner).toBeDefined();
      expect(planner.isEnabled()).toBe(true);
    });

    it('should be disabled when cache-aware planning is not configured', () => {
      const config = createTestConfig();
      delete config.cacheAwarePlanning;
      const planner = new CacheAwareQueryPlanner(config);

      expect(planner.isEnabled()).toBe(false);
    });

    it('should be disabled when cache is disabled', () => {
      const config = createTestConfig();
      config.cache!.enabled = false;
      const planner = new CacheAwareQueryPlanner(config);

      // Cache-aware planning should be disabled when cache is disabled
      expect(planner.isEnabled()).toBe(false);
    });
  });

  describe('partition ordering by cache status', () => {
    let planner: CacheAwareQueryPlanner;

    beforeEach(() => {
      planner = new CacheAwareQueryPlanner(createTestConfig());
    });

    it('should prefer cached partitions over non-cached ones', () => {
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: false }),
        createPartition('p2.bin', { isCached: true }),
        createPartition('p3.bin', { isCached: false }),
        createPartition('p4.bin', { isCached: true }),
      ];

      const reordered = planner.reorderByCache(partitions);

      // Cached partitions should come first
      expect(reordered[0].path).toBe('p2.bin');
      expect(reordered[1].path).toBe('p4.bin');
      expect(reordered[0].isCached).toBe(true);
      expect(reordered[1].isCached).toBe(true);
    });

    it('should maintain relative order within cached and non-cached groups', () => {
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: false }),
        createPartition('p2.bin', { isCached: true }),
        createPartition('p3.bin', { isCached: false }),
        createPartition('p4.bin', { isCached: true }),
        createPartition('p5.bin', { isCached: false }),
      ];

      const reordered = planner.reorderByCache(partitions);

      // Cached partitions maintain their relative order
      const cached = reordered.filter(p => p.isCached);
      expect(cached[0].path).toBe('p2.bin');
      expect(cached[1].path).toBe('p4.bin');

      // Non-cached partitions maintain their relative order
      const nonCached = reordered.filter(p => !p.isCached);
      expect(nonCached[0].path).toBe('p1.bin');
      expect(nonCached[1].path).toBe('p3.bin');
      expect(nonCached[2].path).toBe('p5.bin');
    });

    it('should respect maxReorderDistance limit', () => {
      const config = createTestConfig({ maxReorderDistance: 1 });
      const limitedPlanner = new CacheAwareQueryPlanner(config);

      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: false }),
        createPartition('p2.bin', { isCached: false }),
        createPartition('p3.bin', { isCached: false }),
        createPartition('p4.bin', { isCached: true }), // Can only move 1 position up
      ];

      const reordered = limitedPlanner.reorderByCache(partitions);

      // p4 should move up but only by maxReorderDistance (1 position)
      // Original index 3 -> new index 2 (moved up 1)
      expect(reordered[2].path).toBe('p4.bin');
    });
  });

  describe('cost estimation with cache awareness', () => {
    let planner: CacheAwareQueryPlanner;

    beforeEach(() => {
      planner = new CacheAwareQueryPlanner(createTestConfig({ cacheWeightFactor: 0.5 }));
    });

    it('should reduce cost estimate for cached partitions', () => {
      const cachedPartition = createPartition('cached.bin', { isCached: true, sizeBytes: 10000 });
      const nonCachedPartition = createPartition('noncached.bin', { isCached: false, sizeBytes: 10000 });

      const cachedCost = planner.estimatePartitionCost(cachedPartition);
      const nonCachedCost = planner.estimatePartitionCost(nonCachedPartition);

      // Cached partition should have lower cost (50% reduction with cacheWeightFactor 0.5)
      expect(cachedCost).toBeLessThan(nonCachedCost);
      expect(cachedCost).toBeCloseTo(nonCachedCost * 0.5, 1);
    });

    it('should calculate total plan cost considering cache status', () => {
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true, sizeBytes: 10000 }),
        createPartition('p2.bin', { isCached: false, sizeBytes: 10000 }),
        createPartition('p3.bin', { isCached: true, sizeBytes: 10000 }),
      ];

      const totalCost = planner.calculateTotalCost(partitions);

      // 2 cached (50% cost) + 1 non-cached (full cost)
      // Expected: 2 * (10000 * 0.5) + 1 * 10000 = 10000 + 10000 = 20000
      // With base I/O cost factor
      expect(totalCost).toBeGreaterThan(0);
    });

    it('should estimate cache benefit for a query', () => {
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true, sizeBytes: 10000 }),
        createPartition('p2.bin', { isCached: false, sizeBytes: 10000 }),
        createPartition('p3.bin', { isCached: true, sizeBytes: 10000 }),
      ];

      const benefit = planner.estimateCacheBenefit(partitions);

      // 2 out of 3 partitions are cached = ~66.67%
      expect(benefit.cachedPartitions).toBe(2);
      expect(benefit.totalPartitions).toBe(3);
      expect(benefit.cacheRatio).toBeCloseTo(0.667, 2);
      expect(benefit.estimatedSavings).toBeGreaterThan(0);
    });
  });

  describe('cache-aware plan creation', () => {
    let planner: CacheAwareQueryPlanner;

    beforeEach(() => {
      planner = new CacheAwareQueryPlanner(createTestConfig());
    });

    it('should create a cache-aware plan for a query', () => {
      const query = createTestQuery();
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true }),
        createPartition('p2.bin', { isCached: false }),
        createPartition('p3.bin', { isCached: true }),
      ];

      const plan = planner.createCacheAwarePlan(query, partitions);

      expect(plan).toBeDefined();
      expect(plan.query).toBe(query);
      expect(plan.orderedPartitions).toHaveLength(3);
      expect(plan.cacheStats.cachedPartitions).toBe(2);
      expect(plan.cacheStats.totalPartitions).toBe(3);
    });

    it('should include cache statistics in the plan', () => {
      const query = createTestQuery();
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true, sizeBytes: 10000 }),
        createPartition('p2.bin', { isCached: false, sizeBytes: 20000 }),
      ];

      const plan = planner.createCacheAwarePlan(query, partitions);

      expect(plan.cacheStats.cachedBytes).toBe(10000);
      expect(plan.cacheStats.uncachedBytes).toBe(20000);
      expect(plan.cacheStats.cacheRatio).toBeCloseTo(0.5, 2);
    });

    it('should mark plan as cache-optimized when reordering occurs', () => {
      const query = createTestQuery();
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: false }),
        createPartition('p2.bin', { isCached: true }), // Will be reordered to front
      ];

      const plan = planner.createCacheAwarePlan(query, partitions);

      expect(plan.isReordered).toBe(true);
      expect(plan.orderedPartitions[0].isCached).toBe(true);
    });
  });

  describe('prefetch recommendations', () => {
    let planner: CacheAwareQueryPlanner;

    beforeEach(() => {
      planner = new CacheAwareQueryPlanner(createTestConfig({ prefetchThreshold: 0.7 }));
    });

    it('should recommend prefetch when cache ratio is above threshold', () => {
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true }),
        createPartition('p2.bin', { isCached: true }),
        createPartition('p3.bin', { isCached: true }),
        createPartition('p4.bin', { isCached: false }), // 75% cached
      ];

      const recommendation = planner.getPrefetchRecommendation(partitions);

      // 75% > 70% threshold, should recommend prefetching remaining
      expect(recommendation.shouldPrefetch).toBe(true);
      expect(recommendation.partitionsToPrefetch).toHaveLength(1);
      expect(recommendation.partitionsToPrefetch[0].path).toBe('p4.bin');
    });

    it('should not recommend prefetch when cache ratio is below threshold', () => {
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true }),
        createPartition('p2.bin', { isCached: false }),
        createPartition('p3.bin', { isCached: false }),
        createPartition('p4.bin', { isCached: false }), // 25% cached
      ];

      const recommendation = planner.getPrefetchRecommendation(partitions);

      // 25% < 70% threshold, should not recommend prefetch
      expect(recommendation.shouldPrefetch).toBe(false);
      expect(recommendation.partitionsToPrefetch).toHaveLength(0);
    });

    it('should calculate prefetch cost estimate', () => {
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true, sizeBytes: 10000 }),
        createPartition('p2.bin', { isCached: false, sizeBytes: 20000 }),
      ];

      const recommendation = planner.getPrefetchRecommendation(partitions);

      if (recommendation.shouldPrefetch) {
        expect(recommendation.estimatedPrefetchCost).toBe(20000);
      }
    });
  });

  describe('query hints integration', () => {
    let planner: CacheAwareQueryPlanner;

    beforeEach(() => {
      planner = new CacheAwareQueryPlanner(createTestConfig());
    });

    it('should respect preferCache hint', () => {
      const query: Query = {
        table: 'test_table',
        hints: { preferCache: true },
      };

      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: false }),
        createPartition('p2.bin', { isCached: true }),
      ];

      const plan = planner.createCacheAwarePlan(query, partitions);

      // With preferCache hint, cached partition should be first
      expect(plan.orderedPartitions[0].isCached).toBe(true);
    });

    it('should disable cache-aware planning when forceScan hint is set', () => {
      const query: Query = {
        table: 'test_table',
        hints: { forceScan: true },
      };

      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: false }),
        createPartition('p2.bin', { isCached: true }),
      ];

      const plan = planner.createCacheAwarePlan(query, partitions);

      // With forceScan hint, original order should be preserved
      expect(plan.isReordered).toBe(false);
      expect(plan.orderedPartitions[0].path).toBe('p1.bin');
    });
  });

  describe('cache-aware plan statistics', () => {
    let planner: CacheAwareQueryPlanner;

    beforeEach(() => {
      planner = new CacheAwareQueryPlanner(createTestConfig());
    });

    it('should track cache-aware planning statistics', () => {
      const query = createTestQuery();
      // Non-cached partition first, so reordering will occur
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: false }),
        createPartition('p2.bin', { isCached: true }),
      ];

      // Create multiple plans
      planner.createCacheAwarePlan(query, partitions);
      planner.createCacheAwarePlan(query, partitions);
      planner.createCacheAwarePlan(query, partitions);

      const stats = planner.getStats();

      expect(stats.plansCreated).toBe(3);
      expect(stats.plansReordered).toBeGreaterThan(0);
      expect(stats.averageCacheRatio).toBeGreaterThan(0);
    });

    it('should reset statistics', () => {
      const query = createTestQuery();
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true }),
      ];

      planner.createCacheAwarePlan(query, partitions);
      expect(planner.getStats().plansCreated).toBe(1);

      planner.resetStats();
      expect(planner.getStats().plansCreated).toBe(0);
    });
  });

  describe('edge cases', () => {
    let planner: CacheAwareQueryPlanner;

    beforeEach(() => {
      planner = new CacheAwareQueryPlanner(createTestConfig());
    });

    it('should handle empty partition list', () => {
      const query = createTestQuery();
      const partitions: PartitionInfo[] = [];

      const plan = planner.createCacheAwarePlan(query, partitions);

      expect(plan.orderedPartitions).toHaveLength(0);
      expect(plan.cacheStats.cacheRatio).toBe(0);
      expect(plan.isReordered).toBe(false);
    });

    it('should handle all cached partitions', () => {
      const query = createTestQuery();
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true }),
        createPartition('p2.bin', { isCached: true }),
        createPartition('p3.bin', { isCached: true }),
      ];

      const plan = planner.createCacheAwarePlan(query, partitions);

      expect(plan.cacheStats.cacheRatio).toBe(1);
      expect(plan.isReordered).toBe(false); // No reordering needed
    });

    it('should handle all non-cached partitions', () => {
      const query = createTestQuery();
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: false }),
        createPartition('p2.bin', { isCached: false }),
      ];

      const plan = planner.createCacheAwarePlan(query, partitions);

      expect(plan.cacheStats.cacheRatio).toBe(0);
      expect(plan.isReordered).toBe(false); // No reordering possible
    });

    it('should handle single partition', () => {
      const query = createTestQuery();
      const partitions: PartitionInfo[] = [
        createPartition('p1.bin', { isCached: true }),
      ];

      const plan = planner.createCacheAwarePlan(query, partitions);

      expect(plan.orderedPartitions).toHaveLength(1);
      expect(plan.cacheStats.cacheRatio).toBe(1);
    });
  });

  describe('integration with zone map pruning', () => {
    let planner: CacheAwareQueryPlanner;

    beforeEach(() => {
      planner = new CacheAwareQueryPlanner(createTestConfig());
    });

    it('should work with pre-pruned partitions', () => {
      // Simulating partitions that have already been pruned by zone maps
      const query: Query = {
        table: 'test_table',
        predicates: [{ column: 'id', operator: 'between', value: [50, 150] }],
      };

      // Only partitions that passed zone map pruning
      const prunedPartitions: PartitionInfo[] = [
        createPartition('p2.bin', { isCached: true, zoneMapMin: 50, zoneMapMax: 100 }),
        createPartition('p3.bin', { isCached: false, zoneMapMin: 100, zoneMapMax: 150 }),
      ];

      const plan = planner.createCacheAwarePlan(query, prunedPartitions);

      // Cache-aware planning should still work on pre-pruned set
      expect(plan.orderedPartitions[0].isCached).toBe(true);
      expect(plan.cacheStats.cachedPartitions).toBe(1);
    });
  });
});
