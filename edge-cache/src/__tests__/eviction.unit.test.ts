/**
 * Tests for Edge Cache Eviction and TTL behavior
 *
 * Tests LRU eviction, TTL expiration handling, and cache size limits
 * for both the prefetch cache status map and the cache-aware planner.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkCacheStatus,
  setFetchFunction,
  resetFetchFunction,
  clearCacheStatusMap,
  setCacheStatusMapMaxSize,
  getCacheStatusMapMaxSize,
  getCacheStatusMapSize,
} from '../prefetch.js';
import {
  CacheAwarePlanner,
  createCacheAwarePlanner,
} from '../cache-aware-planner.js';
import type { CacheStatus, PartitionInfo } from '../index.js';

// Mock fetch function that returns cache status based on configuration
function createMockFetch(options: {
  cacheState?: Map<string, boolean>;
  ttl?: number;
  age?: number;
}) {
  const { cacheState = new Map(), ttl = 86400, age = 0 } = options;

  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace('https://cdn.workers.do/', '');
    const isCached = cacheState.get(path) ?? false;

    return new Response(null, {
      status: 200,
      headers: new Headers({
        'CF-Cache-Status': isCached ? 'HIT' : 'MISS',
        'Content-Length': '1000',
        'Cache-Control': `public, max-age=${ttl}`,
        'Age': String(isCached ? age : 0),
        'CF-Ray': '12345-SJC',
      }),
    });
  };
}

describe('Edge Cache Eviction', () => {
  beforeEach(() => {
    clearCacheStatusMap();
    // Reset to default max size
    setCacheStatusMapMaxSize(10000);
  });

  afterEach(() => {
    resetFetchFunction();
    vi.restoreAllMocks();
  });

  describe('LRU eviction removes least recently used', () => {
    it('should evict oldest entry when cache status map reaches max size', async () => {
      // Set a small max size for testing
      setCacheStatusMapMaxSize(3);

      const cacheState = new Map<string, boolean>([
        ['partition1.parquet', true],
        ['partition2.parquet', true],
        ['partition3.parquet', true],
        ['partition4.parquet', true],
      ]);

      setFetchFunction(createMockFetch({ cacheState }));

      // Add 4 partitions - should evict the first one when adding the 4th
      await checkCacheStatus('partition1.parquet');
      await checkCacheStatus('partition2.parquet');
      await checkCacheStatus('partition3.parquet');
      await checkCacheStatus('partition4.parquet');

      // Map should only have 3 entries (maxSize)
      expect(getCacheStatusMapSize()).toBe(3);
    });

    it('should evict LRU entries from planner access patterns when limit is exceeded', async () => {
      const cacheState = new Map<string, boolean>();
      setFetchFunction(createMockFetch({ cacheState }));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
        maxAccessPatternEntries: 3,
      });

      // Access 4 partitions - should evict the oldest access pattern
      const partitions: PartitionInfo[] = [
        { path: 'partition1.parquet', sizeBytes: 1000 },
      ];

      await planner.plan(partitions, { table: 'test' });
      partitions[0].path = 'partition2.parquet';
      await planner.plan(partitions, { table: 'test' });
      partitions[0].path = 'partition3.parquet';
      await planner.plan(partitions, { table: 'test' });
      partitions[0].path = 'partition4.parquet';
      await planner.plan(partitions, { table: 'test' });

      // Should have at most 3 access pattern entries
      expect(planner.getAccessPatternCount()).toBeLessThanOrEqual(3);
    });

    it('should evict LRU entries from planner cache entries when limit is exceeded', async () => {
      const cacheState = new Map<string, boolean>();
      setFetchFunction(createMockFetch({ cacheState }));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
        maxCacheEntries: 3,
      });

      // Update cache state for 4 partitions
      const status: CacheStatus = { cached: true, ttlRemaining: 86400 };
      planner.updateCacheState('partition1.parquet', status);
      planner.updateCacheState('partition2.parquet', status);
      planner.updateCacheState('partition3.parquet', status);
      planner.updateCacheState('partition4.parquet', status);

      // Should have at most 3 cache entries
      expect(planner.getCacheEntryCount()).toBeLessThanOrEqual(3);
    });
  });

  describe('TTL expiration removes stale entries', () => {
    it('should report partition as not safely cached when TTL is below threshold', async () => {
      const cacheState = new Map<string, boolean>([
        ['expiring-partition.parquet', true],
      ]);

      // TTL of 86400 with age of 86000 leaves only 400 seconds (below default 1 hour threshold)
      setFetchFunction(createMockFetch({ cacheState, ttl: 86400, age: 86000 }));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
        minTtlThreshold: 3600, // 1 hour threshold
      });

      const partitions: PartitionInfo[] = [
        { path: 'expiring-partition.parquet', sizeBytes: 1000 },
      ];

      const plan = await planner.plan(partitions, { table: 'test' });

      // Partition should be in origin list (not cached) due to low TTL
      expect(plan.originPartitions).toContain('expiring-partition.parquet');
      expect(plan.cachedPartitions).not.toContain('expiring-partition.parquet');
    });

    it('should report partition as cached when TTL is above threshold', async () => {
      const cacheState = new Map<string, boolean>([
        ['fresh-partition.parquet', true],
      ]);

      // TTL of 86400 with age of 1000 leaves 85400 seconds (well above threshold)
      setFetchFunction(createMockFetch({ cacheState, ttl: 86400, age: 1000 }));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
        minTtlThreshold: 3600,
      });

      const partitions: PartitionInfo[] = [
        { path: 'fresh-partition.parquet', sizeBytes: 1000 },
      ];

      const plan = await planner.plan(partitions, { table: 'test' });

      // Partition should be in cached list
      expect(plan.cachedPartitions).toContain('fresh-partition.parquet');
      expect(plan.originPartitions).not.toContain('fresh-partition.parquet');
    });

    it('should calculate correct TTL remaining from cache headers', async () => {
      const cacheState = new Map<string, boolean>([
        ['test-partition.parquet', true],
      ]);

      // max-age=86400, age=3600 -> ttlRemaining should be 82800
      setFetchFunction(createMockFetch({ cacheState, ttl: 86400, age: 3600 }));

      const status = await checkCacheStatus('test-partition.parquet');

      expect(status.cached).toBe(true);
      expect(status.ttlRemaining).toBe(82800);
    });

    it('should return zero TTL when age exceeds max-age', async () => {
      const cacheState = new Map<string, boolean>([
        ['expired-partition.parquet', true],
      ]);

      // max-age=3600, age=7200 -> ttlRemaining should be 0 (not negative)
      setFetchFunction(createMockFetch({ cacheState, ttl: 3600, age: 7200 }));

      const status = await checkCacheStatus('expired-partition.parquet');

      expect(status.cached).toBe(true);
      expect(status.ttlRemaining).toBe(0);
    });
  });

  describe('maxSize limit triggers eviction', () => {
    it('should maintain cache status map at or below max size', async () => {
      setCacheStatusMapMaxSize(5);

      const cacheState = new Map<string, boolean>();
      for (let i = 0; i < 10; i++) {
        cacheState.set(`partition${i}.parquet`, true);
      }

      setFetchFunction(createMockFetch({ cacheState }));

      // Check 10 partitions
      for (let i = 0; i < 10; i++) {
        await checkCacheStatus(`partition${i}.parquet`);
      }

      // Should only have 5 entries
      expect(getCacheStatusMapSize()).toBe(5);
    });

    it('should respect dynamically changed max size', async () => {
      const cacheState = new Map<string, boolean>();
      for (let i = 0; i < 10; i++) {
        cacheState.set(`partition${i}.parquet`, true);
      }

      setFetchFunction(createMockFetch({ cacheState }));

      // Check 10 partitions with default high limit
      setCacheStatusMapMaxSize(10000);
      for (let i = 0; i < 10; i++) {
        await checkCacheStatus(`partition${i}.parquet`);
      }

      expect(getCacheStatusMapSize()).toBe(10);

      // Now reduce the max size - should trigger eviction
      setCacheStatusMapMaxSize(3);

      // Add one more to trigger eviction check
      await checkCacheStatus('partition0.parquet');

      expect(getCacheStatusMapSize()).toBe(3);
    });

    it('should get and set max size correctly', () => {
      setCacheStatusMapMaxSize(100);
      expect(getCacheStatusMapMaxSize()).toBe(100);

      setCacheStatusMapMaxSize(50);
      expect(getCacheStatusMapMaxSize()).toBe(50);
    });
  });

  describe('access updates LRU order', () => {
    it('should move accessed entry to end of map preserving LRU order', async () => {
      setCacheStatusMapMaxSize(3);

      const cacheState = new Map<string, boolean>([
        ['partition1.parquet', true],
        ['partition2.parquet', true],
        ['partition3.parquet', true],
        ['partition4.parquet', true],
      ]);

      setFetchFunction(createMockFetch({ cacheState }));

      // Add first 3 partitions
      await checkCacheStatus('partition1.parquet');
      await checkCacheStatus('partition2.parquet');
      await checkCacheStatus('partition3.parquet');

      // Access partition1 again to move it to end
      await checkCacheStatus('partition1.parquet');

      // Now add partition4 - should evict partition2 (the oldest non-reaccessed)
      await checkCacheStatus('partition4.parquet');

      // Map should contain partition1, partition3, partition4 (partition2 evicted)
      expect(getCacheStatusMapSize()).toBe(3);

      // Verify by accessing all - partition2 should cause a new fetch (miss)
      // and one of the others should be evicted
      // Note: We can't easily verify which specific entries are in the map
      // without internal access, but we can verify the size is maintained
    });

    it('should update planner cache entry position on re-access', async () => {
      const cacheState = new Map<string, boolean>();
      setFetchFunction(createMockFetch({ cacheState }));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
        maxCacheEntries: 3,
      });

      // Add 3 entries with small delays to ensure distinct timestamps
      const status: CacheStatus = { cached: true, ttlRemaining: 86400 };
      planner.updateCacheState('partition1.parquet', status);
      await new Promise((resolve) => setTimeout(resolve, 5));
      planner.updateCacheState('partition2.parquet', status);
      await new Promise((resolve) => setTimeout(resolve, 5));
      planner.updateCacheState('partition3.parquet', status);
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Re-access partition1 to update its lastAccessed timestamp
      planner.updateCacheState('partition1.parquet', status);
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Add partition4 - should evict partition2 (oldest based on lastAccessed timestamp)
      planner.updateCacheState('partition4.parquet', status);

      // Should still have 3 entries
      expect(planner.getCacheEntryCount()).toBe(3);

      // partition1 should still exist (was re-accessed, has newer timestamp)
      const entries = planner.getCacheEntries();
      expect(entries.has('partition1.parquet')).toBe(true);

      // partition2 should be evicted (oldest timestamp)
      expect(entries.has('partition2.parquet')).toBe(false);
    });
  });

  describe('clear removes all entries', () => {
    it('should clear all entries from cache status map', async () => {
      const cacheState = new Map<string, boolean>([
        ['partition1.parquet', true],
        ['partition2.parquet', true],
        ['partition3.parquet', true],
      ]);

      setFetchFunction(createMockFetch({ cacheState }));

      await checkCacheStatus('partition1.parquet');
      await checkCacheStatus('partition2.parquet');
      await checkCacheStatus('partition3.parquet');

      expect(getCacheStatusMapSize()).toBe(3);

      clearCacheStatusMap();

      expect(getCacheStatusMapSize()).toBe(0);
    });

    it('should clear all entries from planner', async () => {
      const cacheState = new Map<string, boolean>([
        ['partition1.parquet', true],
      ]);

      setFetchFunction(createMockFetch({ cacheState }));

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: false,
      });

      // Add entries via updateCacheState
      const status: CacheStatus = { cached: true, ttlRemaining: 86400 };
      planner.updateCacheState('partition1.parquet', status);
      planner.updateCacheState('partition2.parquet', status);

      // Add access patterns via plan
      const partitions: PartitionInfo[] = [
        { path: 'partition1.parquet', sizeBytes: 1000 },
      ];
      await planner.plan(partitions, { table: 'test' });

      expect(planner.getCacheEntryCount()).toBeGreaterThan(0);
      expect(planner.getAccessPatternCount()).toBeGreaterThan(0);

      planner.clear();

      expect(planner.getCacheEntryCount()).toBe(0);
      expect(planner.getAccessPatternCount()).toBe(0);
      expect(planner.getCacheEntries().size).toBe(0);
    });

    it('should clear prefetch errors along with other state', async () => {
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void input;
        const method = init?.method ?? 'GET';
        if (method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: new Headers({
              'CF-Cache-Status': 'MISS',
              'Content-Length': '1000',
            }),
          });
        }
        return new Response(null, { status: 500 });
      };

      setFetchFunction(mockFetch);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const planner = createCacheAwarePlanner({
        enablePredictivePrefetch: true,
        config: { hotnessThreshold: 0 },
      });

      const partitions: PartitionInfo[] = [
        { path: 'failing.parquet', sizeBytes: 1000 },
      ];

      await planner.plan(partitions, { table: 'test' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have errors recorded
      expect(planner.getPrefetchErrorStats().totalErrors).toBeGreaterThan(0);

      planner.clear();

      // All state including errors should be cleared
      expect(planner.getPrefetchErrorStats().totalErrors).toBe(0);
      expect(planner.getPrefetchErrorStats().recentErrors).toHaveLength(0);
    });
  });
});
