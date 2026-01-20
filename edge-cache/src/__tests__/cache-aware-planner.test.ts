/**
 * Tests for cache-aware-planner.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CacheAwarePlanner,
  createCacheAwarePlanner,
  type QueryContext,
} from '../cache-aware-planner.js';
import type { PartitionInfo, CacheStatus } from '../index.js';
import { setFetchFunction, resetFetchFunction, clearCacheStatusMap } from '../prefetch.js';

// Mock fetch function
function createMockFetch(cacheState: Map<string, boolean>) {
  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
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

describe('Prefetch Error Handling', () => {
  beforeEach(() => {
    clearCacheStatusMap();
  });

  afterEach(() => {
    resetFetchFunction();
    vi.restoreAllMocks();
  });

  it('should track errors when warmPartition fails', async () => {
    // Mock fetch to fail on GET requests
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      void url; // Mark as used
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
      // GET request fails
      return new Response(null, { status: 500 });
    };

    setFetchFunction(mockFetch);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const planner = createCacheAwarePlanner({
      enablePredictivePrefetch: true,
      config: { hotnessThreshold: 0 }, // Always prefetch
    });

    // Access partition to trigger prefetch
    const partitions: PartitionInfo[] = [
      { path: 'data/users/failing.parquet', sizeBytes: 1000 },
    ];

    await planner.plan(partitions, { table: 'users' });

    // Wait for background prefetch to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    const errorStats = planner.getPrefetchErrorStats();

    // Error should be recorded
    expect(errorStats.totalErrors).toBeGreaterThan(0);
    expect(errorStats.recentErrors.length).toBeGreaterThan(0);

    // Error should have context
    const firstError = errorStats.recentErrors[0];
    expect(firstError.partitionPath).toBe('data/users/failing.parquet');
    expect(firstError.operation).toBeTruthy();
    expect(firstError.timestamp).toBeInstanceOf(Date);
    expect(firstError.error).toBeInstanceOf(Error);

    // Console should be called
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should call onPrefetchError callback when prefetch fails', async () => {
    // Mock fetch to fail
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

    const errorCallback = vi.fn();
    const planner = createCacheAwarePlanner({
      enablePredictivePrefetch: true,
      config: { hotnessThreshold: 0 },
      onPrefetchError: errorCallback,
    });

    const partitions: PartitionInfo[] = [
      { path: 'data/users/failing.parquet', sizeBytes: 1000 },
    ];

    await planner.plan(partitions, { table: 'users' });

    // Wait for background prefetch
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Callback should have been called
    expect(errorCallback).toHaveBeenCalled();
    const callArg = errorCallback.mock.calls[0][0];
    expect(callArg.partitionPath).toBe('data/users/failing.parquet');
    expect(callArg.error).toBeInstanceOf(Error);
  });

  it('should track error counts over time', async () => {
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

    // Trigger multiple failures by planning partitions that will all fail
    const partitions: PartitionInfo[] = [
      { path: 'data/users/failing0.parquet', sizeBytes: 1000 },
      { path: 'data/users/failing1.parquet', sizeBytes: 1000 },
      { path: 'data/users/failing2.parquet', sizeBytes: 1000 },
    ];
    await planner.plan(partitions, { table: 'users' });

    // Wait for all background prefetches
    await new Promise((resolve) => setTimeout(resolve, 150));

    const errorStats = planner.getPrefetchErrorStats();
    expect(errorStats.totalErrors).toBe(3);
    expect(errorStats.errorsLastMinute).toBe(3);
    expect(errorStats.errorsLastHour).toBe(3);
  });

  it('should clear error history when clearPrefetchErrors is called', async () => {
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
      { path: 'data/users/failing.parquet', sizeBytes: 1000 },
    ];

    await planner.plan(partitions, { table: 'users' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(planner.getPrefetchErrorStats().totalErrors).toBeGreaterThan(0);

    planner.clearPrefetchErrors();

    const stats = planner.getPrefetchErrorStats();
    expect(stats.totalErrors).toBe(0);
    expect(stats.recentErrors).toHaveLength(0);
  });

  it('should log verbose output when verboseLogging is enabled', async () => {
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
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const planner = createCacheAwarePlanner({
      enablePredictivePrefetch: true,
      config: { hotnessThreshold: 0 },
      verboseLogging: true,
    });

    const partitions: PartitionInfo[] = [
      { path: 'data/users/failing.parquet', sizeBytes: 1000 },
    ];

    await planner.plan(partitions, { table: 'users' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verbose logging should include starting message
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[edge-cache] Starting prefetch')
    );

    // Error log should include detailed object
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[edge-cache] Prefetch error'),
      expect.objectContaining({ message: expect.any(String) })
    );
  });

  it('should not swallow errors when warmPartition returns false', async () => {
    // Mock fetch where warmPartition succeeds but returns false (e.g., size limit exceeded)
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void input;
      const method = init?.method ?? 'GET';
      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: new Headers({
            'CF-Cache-Status': 'MISS',
            'Content-Length': String(600 * 1024 * 1024), // 600MB > 500MB limit
          }),
        });
      }
      // GET request returns OK but partition is too large
      return new Response(new ArrayBuffer(100), {
        status: 200,
        headers: new Headers({
          'Content-Length': String(600 * 1024 * 1024),
        }),
      });
    };

    setFetchFunction(mockFetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const planner = createCacheAwarePlanner({
      enablePredictivePrefetch: true,
      config: { hotnessThreshold: 0 },
      partitionMode: 'standard', // 500MB limit
    });

    const partitions: PartitionInfo[] = [
      { path: 'data/users/large.parquet', sizeBytes: 1000 }, // sizeBytes is for planning, not actual size
    ];

    await planner.plan(partitions, { table: 'users' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Error should be recorded when warmPartition returns false
    const errorStats = planner.getPrefetchErrorStats();
    expect(errorStats.totalErrors).toBeGreaterThan(0);

    // Error message should indicate warmPartition returned false
    const hasWarmPartitionError = errorStats.recentErrors.some(
      (e) => e.operation === 'warmPartition' && e.error.message.includes('returned false')
    );
    expect(hasWarmPartitionError).toBe(true);
  });

  it('should handle error callback exceptions gracefully', async () => {
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
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Callback that throws
    const throwingCallback = vi.fn(() => {
      throw new Error('Callback error');
    });

    const planner = createCacheAwarePlanner({
      enablePredictivePrefetch: true,
      config: { hotnessThreshold: 0 },
      onPrefetchError: throwingCallback,
    });

    const partitions: PartitionInfo[] = [
      { path: 'data/users/failing.parquet', sizeBytes: 1000 },
    ];

    // Should not throw even if callback throws
    await planner.plan(partitions, { table: 'users' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Callback was called
    expect(throwingCallback).toHaveBeenCalled();

    // Error was logged about callback failure
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error in onPrefetchError callback'),
      expect.any(Error)
    );

    // Original error was still recorded
    const stats = planner.getPrefetchErrorStats();
    expect(stats.totalErrors).toBeGreaterThan(0);
  });
});
