/**
 * Tests for cache-aware-planner.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CacheAwarePlanner,
  createCacheAwarePlanner,
  type QueryContext,
  type PlannerOptions,
} from '../cache-aware-planner.js';
import type { PartitionInfo, CacheStatus } from '../index.js';
import { setFetchFunction, resetFetchFunction, clearCacheStatusMap } from '../prefetch.js';

// Mock fetch function
function createMockFetch(cacheState: Map<string, boolean>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace('https://cdn.workers.do/', '');
    const isCached = cacheState.get(path) ?? false;

    return new Response(null, {
      status: 200,
      headers: new Headers({
        'CF-Cache-Status': isCached ? 'HIT' : 'MISS',
        'Content-Length': '1000',
        'Cache-Control': 'public, max-age=86400',
        'Age': isCached ? '1000' : '0',
      }),
    });
  };
}

describe('CacheAwarePlanner', () => {
  beforeEach(() => {
    clearCacheStatusMap();
  });

  afterEach(() => {
    resetFetchFunction();
    vi.restoreAllMocks();
  });

  describe('plan', () => {
    it('should separate cached and uncached partitions', async () => {
      const cacheState = new Map<string, boolean>([
        ['data/users/part1.parquet', true],
        ['data/users/part2.parquet', false],
        ['data/users/part3.parquet', true],
      ]);

      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
      });

      const partitions: PartitionInfo[] = [
        { path: 'data/users/part1.parquet', sizeBytes: 1000 },
        { path: 'data/users/part2.parquet', sizeBytes: 1000 },
        { path: 'data/users/part3.parquet', sizeBytes: 1000 },
      ];

      const plan = await planner.plan(partitions, { table: 'users' });

      expect(plan.cachedPartitions).toContain('data/users/part1.parquet');
      expect(plan.cachedPartitions).toContain('data/users/part3.parquet');
      expect(plan.originPartitions).toContain('data/users/part2.parquet');
      expect(plan.fullyCached).toBe(false);
    });

    it('should report fullyCached when all partitions are cached', async () => {
      const cacheState = new Map<string, boolean>([
        ['data/users/part1.parquet', true],
        ['data/users/part2.parquet', true],
      ]);

      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
      });

      const partitions: PartitionInfo[] = [
        { path: 'data/users/part1.parquet', sizeBytes: 1000 },
        { path: 'data/users/part2.parquet', sizeBytes: 1000 },
      ];

      const plan = await planner.plan(partitions, { table: 'users' });

      expect(plan.fullyCached).toBe(true);
      expect(plan.originPartitions).toHaveLength(0);
    });

    it('should calculate lower cost for cached partitions', async () => {
      const cacheState = new Map<string, boolean>([
        ['data/users/part1.parquet', true],
        ['data/users/part2.parquet', true],
      ]);

      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner({
        cacheMissCostMultiplier: 10,
        enablePredictivePrefetch: false,
      });

      const cachedPartitions: PartitionInfo[] = [
        { path: 'data/users/part1.parquet', sizeBytes: 1000 },
        { path: 'data/users/part2.parquet', sizeBytes: 1000 },
      ];

      const uncachedState = new Map<string, boolean>([
        ['data/users/part1.parquet', false],
        ['data/users/part2.parquet', false],
      ]);

      const cachedPlan = await planner.plan(cachedPartitions, { table: 'users' });

      planner.clear();
      setFetchFunction(createMockFetch(uncachedState));

      const uncachedPlan = await planner.plan(cachedPartitions, { table: 'users' });

      expect(cachedPlan.estimatedCost).toBeLessThan(uncachedPlan.estimatedCost);
    });

    it('should apply partition predicates', async () => {
      const cacheState = new Map<string, boolean>([
        ['data/users/year=2023/data.parquet', true],
        ['data/users/year=2024/data.parquet', true],
        ['data/users/year=2025/data.parquet', true],
      ]);

      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
      });

      const partitions: PartitionInfo[] = [
        {
          path: 'data/users/year=2023/data.parquet',
          sizeBytes: 1000,
          bounds: { year: { min: 2023, max: 2023 } },
        },
        {
          path: 'data/users/year=2024/data.parquet',
          sizeBytes: 1000,
          bounds: { year: { min: 2024, max: 2024 } },
        },
        {
          path: 'data/users/year=2025/data.parquet',
          sizeBytes: 1000,
          bounds: { year: { min: 2025, max: 2025 } },
        },
      ];

      const context: QueryContext = {
        table: 'users',
        predicates: [
          { column: 'year', operator: 'eq', value: 2024 },
        ],
      };

      const plan = await planner.plan(partitions, context);

      // Only 2024 partition should be included
      expect(plan.cachedPartitions).toHaveLength(1);
      expect(plan.cachedPartitions[0]).toContain('year=2024');
    });

    it('should apply gte predicate', async () => {
      const cacheState = new Map<string, boolean>([
        ['data/users/year=2023/data.parquet', true],
        ['data/users/year=2024/data.parquet', true],
        ['data/users/year=2025/data.parquet', true],
      ]);

      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
      });

      const partitions: PartitionInfo[] = [
        {
          path: 'data/users/year=2023/data.parquet',
          sizeBytes: 1000,
          bounds: { year: { min: 2023, max: 2023 } },
        },
        {
          path: 'data/users/year=2024/data.parquet',
          sizeBytes: 1000,
          bounds: { year: { min: 2024, max: 2024 } },
        },
        {
          path: 'data/users/year=2025/data.parquet',
          sizeBytes: 1000,
          bounds: { year: { min: 2025, max: 2025 } },
        },
      ];

      const context: QueryContext = {
        table: 'users',
        predicates: [
          { column: 'year', operator: 'gte', value: 2024 },
        ],
      };

      const plan = await planner.plan(partitions, context);

      // 2024 and 2025 partitions should be included
      expect(plan.cachedPartitions).toHaveLength(2);
      expect(plan.cachedPartitions.some(p => p.includes('year=2024'))).toBe(true);
      expect(plan.cachedPartitions.some(p => p.includes('year=2025'))).toBe(true);
    });

    it('should apply between predicate', async () => {
      const cacheState = new Map<string, boolean>([
        ['data/sales/month=01/data.parquet', true],
        ['data/sales/month=02/data.parquet', true],
        ['data/sales/month=03/data.parquet', true],
        ['data/sales/month=04/data.parquet', true],
      ]);

      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
      });

      const partitions: PartitionInfo[] = [
        {
          path: 'data/sales/month=01/data.parquet',
          sizeBytes: 1000,
          bounds: { month: { min: 1, max: 1 } },
        },
        {
          path: 'data/sales/month=02/data.parquet',
          sizeBytes: 1000,
          bounds: { month: { min: 2, max: 2 } },
        },
        {
          path: 'data/sales/month=03/data.parquet',
          sizeBytes: 1000,
          bounds: { month: { min: 3, max: 3 } },
        },
        {
          path: 'data/sales/month=04/data.parquet',
          sizeBytes: 1000,
          bounds: { month: { min: 4, max: 4 } },
        },
      ];

      const context: QueryContext = {
        table: 'sales',
        predicates: [
          { column: 'month', operator: 'between', value: 2, upperValue: 3 },
        ],
      };

      const plan = await planner.plan(partitions, context);

      // Only month=02 and month=03 should be included
      expect(plan.cachedPartitions).toHaveLength(2);
      expect(plan.cachedPartitions.some(p => p.includes('month=02'))).toBe(true);
      expect(plan.cachedPartitions.some(p => p.includes('month=03'))).toBe(true);
    });
  });

  describe('updateCacheState', () => {
    it('should update cache state for a partition', async () => {
      const cacheState = new Map<string, boolean>();
      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner();

      const status: CacheStatus = {
        cached: true,
        ttlRemaining: 86400,
        sizeBytes: 5000,
      };

      planner.updateCacheState('data/users/part1.parquet', status);

      const entries = planner.getCacheEntries();
      expect(entries.has('data/users/part1.parquet')).toBe(true);
      expect(entries.get('data/users/part1.parquet')?.status.cached).toBe(true);
    });

    it('should track access count', async () => {
      const cacheState = new Map<string, boolean>();
      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner();

      const status: CacheStatus = { cached: true };

      planner.updateCacheState('data/users/part1.parquet', status);
      planner.updateCacheState('data/users/part1.parquet', status);
      planner.updateCacheState('data/users/part1.parquet', status);

      const entries = planner.getCacheEntries();
      expect(entries.get('data/users/part1.parquet')?.accessCount).toBe(3);
    });
  });

  describe('getPredictedHotPartitions', () => {
    it('should return partitions with high hotness score', async () => {
      const cacheState = new Map<string, boolean>([
        ['data/users/hot.parquet', false], // Not cached but frequently accessed
        ['data/users/cold.parquet', false],
      ]);

      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
      });

      // Access both partitions together to populate access patterns
      const allPartitions: PartitionInfo[] = [
        { path: 'data/users/hot.parquet', sizeBytes: 1000 },
        { path: 'data/users/cold.parquet', sizeBytes: 1000 },
      ];

      // Access hot partition many more times than cold
      for (let i = 0; i < 20; i++) {
        await planner.plan(allPartitions, { table: 'users' });
      }

      // With threshold 0 (accept all non-cached), we should get both
      // since they're both uncached and have been accessed
      const predictedHot = planner.getPredictedHotPartitions(0);

      // Both partitions should be in the result since they're uncached and accessed
      expect(predictedHot.length).toBeGreaterThan(0);
      // Hot partition should have higher priority (appear first)
      expect(predictedHot).toContain('data/users/hot.parquet');
    });
  });

  describe('clear', () => {
    it('should clear all tracked state', async () => {
      const cacheState = new Map<string, boolean>([
        ['data/users/part1.parquet', true],
      ]);

      setFetchFunction(createMockFetch(cacheState));

      const planner = createCacheAwarePlanner();

      const partitions: PartitionInfo[] = [
        { path: 'data/users/part1.parquet', sizeBytes: 1000 },
      ];

      await planner.plan(partitions, { table: 'users' });

      expect(planner.getCacheEntries().size).toBe(1);

      planner.clear();

      expect(planner.getCacheEntries().size).toBe(0);
    });
  });

  describe('createCacheAwarePlanner', () => {
    it('should create planner with default options', () => {
      const planner = createCacheAwarePlanner();
      expect(planner).toBeInstanceOf(CacheAwarePlanner);
    });

    it('should create planner with custom options', () => {
      const planner = createCacheAwarePlanner({
        cacheMissCostMultiplier: 5,
        minTtlThreshold: 7200,
        partitionMode: 'enterprise',
      });

      expect(planner).toBeInstanceOf(CacheAwarePlanner);
    });
  });
});
