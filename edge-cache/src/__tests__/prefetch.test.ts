/**
 * Tests for prefetch.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  prefetchDataset,
  warmPartition,
  checkCacheStatus,
  invalidatePartition,
  invalidateTable,
  createPrefetcher,
  setFetchFunction,
  resetFetchFunction,
  clearCacheStatusMap,
  setCacheStatusMapMaxSize,
  getCacheStatusMapMaxSize,
  getCacheStatusMapSize,
} from '../prefetch.js';
import type { PrefetchProgress } from '../index.js';

// Mock fetch function
function createMockFetch(responses: Map<string, { status: number; headers: Headers; body?: ArrayBuffer }>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    const key = `${method}:${url}`;
    const response = responses.get(key) ?? responses.get(`*:${url}`);

    if (!response) {
      return new Response(null, { status: 404 });
    }

    return new Response(response.body ?? null, {
      status: response.status,
      headers: response.headers,
    });
  };
}

describe('prefetch', () => {
  beforeEach(() => {
    clearCacheStatusMap();
  });

  afterEach(() => {
    resetFetchFunction();
    vi.restoreAllMocks();
  });

  describe('warmPartition', () => {
    it('should warm a partition successfully', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers; body?: ArrayBuffer }>();

      // HEAD request - not cached
      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'MISS',
          'Content-Length': '1000',
        }),
      });

      // GET request to warm
      mockResponses.set('GET:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'HIT',
          'Content-Length': '1000',
          'Cache-Control': 'public, max-age=86400',
        }),
        body: new ArrayBuffer(1000),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const result = await warmPartition('data/users/part1.parquet');
      expect(result).toBe(true);
    });

    it('should return true if partition is already cached', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      // HEAD request - already cached
      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'HIT',
          'Content-Length': '1000',
          'Cache-Control': 'public, max-age=86400',
          'Age': '3600',
        }),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const result = await warmPartition('data/users/part1.parquet');
      expect(result).toBe(true);
    });

    it('should return false if partition exceeds size limit', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers; body?: ArrayBuffer }>();

      // HEAD request - not cached
      mockResponses.set('HEAD:https://cdn.workers.do/data/users/large.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'MISS',
          'Content-Length': String(600 * 1024 * 1024), // 600MB > 500MB limit
        }),
      });

      // GET request
      mockResponses.set('GET:https://cdn.workers.do/data/users/large.parquet', {
        status: 200,
        headers: new Headers({
          'Content-Length': String(600 * 1024 * 1024),
        }),
        body: new ArrayBuffer(100), // Small body for test
      });

      setFetchFunction(createMockFetch(mockResponses));

      // Use console.warn spy
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await warmPartition('data/users/large.parquet', 'standard');
      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should handle enterprise mode for large files', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers; body?: ArrayBuffer }>();

      // HEAD request - not cached
      mockResponses.set('HEAD:https://cdn.workers.do/data/users/large.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'MISS',
          'Content-Length': String(1 * 1024 * 1024 * 1024), // 1GB
        }),
      });

      // GET request
      mockResponses.set('GET:https://cdn.workers.do/data/users/large.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'HIT',
          'Content-Length': String(1 * 1024 * 1024 * 1024),
          'Cache-Control': 'public, max-age=86400',
        }),
        body: new ArrayBuffer(100),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const result = await warmPartition('data/users/large.parquet', 'enterprise');
      expect(result).toBe(true);
    });

    it('should return false on fetch error', async () => {
      setFetchFunction(async () => {
        throw new Error('Network error');
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await warmPartition('data/users/part1.parquet');
      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('checkCacheStatus', () => {
    it('should return cached status when partition is in cache', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'HIT',
          'Content-Length': '5000',
          'Cache-Control': 'public, max-age=86400',
          'Age': '3600',
          'CF-Ray': '12345-SJC',
        }),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const status = await checkCacheStatus('data/users/part1.parquet');

      expect(status.cached).toBe(true);
      expect(status.sizeBytes).toBe(5000);
      expect(status.ttlRemaining).toBe(86400 - 3600);
      expect(status.edgeLocation).toBe('SJC');
    });

    it('should return uncached status when partition is not in cache', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part2.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'MISS',
        }),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const status = await checkCacheStatus('data/users/part2.parquet');

      expect(status.cached).toBe(false);
      expect(status.ttlRemaining).toBeUndefined();
    });

    it('should return uncached status on error', async () => {
      setFetchFunction(async () => {
        throw new Error('Network error');
      });

      const status = await checkCacheStatus('data/users/error.parquet');

      expect(status.cached).toBe(false);
    });

    it('should track hit count across multiple checks', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'HIT',
          'Content-Length': '5000',
        }),
      });

      setFetchFunction(createMockFetch(mockResponses));

      await checkCacheStatus('data/users/part1.parquet');
      await checkCacheStatus('data/users/part1.parquet');
      const status = await checkCacheStatus('data/users/part1.parquet');

      expect(status.hitCount).toBe(3);
    });
  });

  describe('invalidatePartition', () => {
    it('should invalidate a cached partition', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      mockResponses.set('PURGE:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const result = await invalidatePartition('data/users/part1.parquet');

      expect(result).toBe(true);
    });

    it('should return false on purge failure', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      mockResponses.set('PURGE:https://cdn.workers.do/data/users/part1.parquet', {
        status: 500,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const result = await invalidatePartition('data/users/part1.parquet');

      expect(result).toBe(false);
    });
  });

  describe('invalidateTable', () => {
    it('should invalidate all partitions for a table', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      mockResponses.set('POST:https://cdn.workers.do/purge', {
        status: 200,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const result = await invalidateTable('users');

      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('prefetchDataset', () => {
    it('should prefetch multiple partitions', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers; body?: ArrayBuffer }>();

      const partitions = [
        'data/users/year=2024/month=01/data.parquet',
        'data/users/year=2024/month=02/data.parquet',
      ];

      for (const p of partitions) {
        // HEAD request
        mockResponses.set(`HEAD:https://cdn.workers.do/${p}`, {
          status: 200,
          headers: new Headers({
            'CF-Cache-Status': 'MISS',
            'Content-Length': '1000',
          }),
        });

        // GET request
        mockResponses.set(`GET:https://cdn.workers.do/${p}`, {
          status: 200,
          headers: new Headers({
            'CF-Cache-Status': 'HIT',
            'Content-Length': '1000',
            'Cache-Control': 'public, max-age=86400',
          }),
          body: new ArrayBuffer(1000),
        });
      }

      setFetchFunction(createMockFetch(mockResponses));

      const progress: PrefetchProgress[] = [];
      const result = await prefetchDataset('users', {
        partitions,
        onProgress: (p) => progress.push({ ...p }),
      });

      expect(result.success).toBe(true);
      expect(result.cachedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.totalBytes).toBeGreaterThan(0);
      expect(progress.length).toBeGreaterThan(0);
    });

    it('should report failures for partitions that fail', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers; body?: ArrayBuffer }>();

      // First partition succeeds
      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'MISS',
          'Content-Length': '1000',
        }),
      });
      mockResponses.set('GET:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'HIT',
          'Content-Length': '1000',
        }),
        body: new ArrayBuffer(1000),
      });

      // Second partition fails
      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part2.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'MISS',
        }),
      });
      mockResponses.set('GET:https://cdn.workers.do/data/users/part2.parquet', {
        status: 500,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const result = await prefetchDataset('users', {
        partitions: ['data/users/part1.parquet', 'data/users/part2.parquet'],
      });

      expect(result.success).toBe(false);
      expect(result.cachedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].partition).toBe('data/users/part2.parquet');
    });

    it('should respect custom TTL', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers; body?: ArrayBuffer }>();

      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'MISS',
        }),
      });
      mockResponses.set('GET:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'HIT',
          'Content-Length': '1000',
        }),
        body: new ArrayBuffer(1000),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const result = await prefetchDataset('users', {
        partitions: ['data/users/part1.parquet'],
        ttl: 3600, // 1 hour
      });

      expect(result.success).toBe(true);
    });
  });

  describe('createPrefetcher', () => {
    it('should create a prefetcher with custom config', () => {
      const prefetcher = createPrefetcher({
        cdnBaseUrl: 'https://custom-cdn.workers.do',
        defaultMode: 'enterprise',
        maxConcurrentPrefetch: 10,
      });

      expect(prefetcher.config.cdnBaseUrl).toBe('https://custom-cdn.workers.do');
      expect(prefetcher.config.defaultMode).toBe('enterprise');
      expect(prefetcher.config.maxConcurrentPrefetch).toBe(10);
    });

    it('should maintain separate cache tracking per instance', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      mockResponses.set('HEAD:https://cdn.workers.do/data/users/part1.parquet', {
        status: 200,
        headers: new Headers({
          'CF-Cache-Status': 'HIT',
          'Content-Length': '5000',
        }),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const prefetcher1 = createPrefetcher();
      const prefetcher2 = createPrefetcher();

      await prefetcher1.checkCacheStatus('data/users/part1.parquet');

      const cached1 = prefetcher1.getCachedPartitions();
      const cached2 = prefetcher2.getCachedPartitions();

      expect(cached1.size).toBe(1);
      expect(cached2.size).toBe(0);
    });
  });

  describe('LRU cache eviction', () => {
    beforeEach(() => {
      clearCacheStatusMap();
      // Reset to a small size for testing
      setCacheStatusMapMaxSize(3);
    });

    afterEach(() => {
      // Reset to default
      setCacheStatusMapMaxSize(10000);
    });

    it('should enforce max cache size', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      // Create mock responses for multiple partitions
      for (let i = 0; i < 5; i++) {
        mockResponses.set(`HEAD:https://cdn.workers.do/data/part${i}.parquet`, {
          status: 200,
          headers: new Headers({
            'CF-Cache-Status': 'HIT',
            'Content-Length': '1000',
          }),
        });
      }

      setFetchFunction(createMockFetch(mockResponses));

      // Add 5 entries to cache with max size of 3
      for (let i = 0; i < 5; i++) {
        await checkCacheStatus(`data/part${i}.parquet`);
      }

      // Cache size should not exceed maxCacheSize (3)
      expect(getCacheStatusMapSize()).toBe(3);
    });

    it('should evict oldest entries when cache is full', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      // Create mock responses for multiple partitions
      for (let i = 0; i < 5; i++) {
        mockResponses.set(`HEAD:https://cdn.workers.do/data/part${i}.parquet`, {
          status: 200,
          headers: new Headers({
            'CF-Cache-Status': 'HIT',
            'Content-Length': '1000',
          }),
        });
      }

      setFetchFunction(createMockFetch(mockResponses));

      // Add entries: part0, part1, part2
      await checkCacheStatus('data/part0.parquet');
      await checkCacheStatus('data/part1.parquet');
      await checkCacheStatus('data/part2.parquet');

      expect(getCacheStatusMapSize()).toBe(3);

      // Add part3 - should evict part0 (oldest)
      await checkCacheStatus('data/part3.parquet');

      expect(getCacheStatusMapSize()).toBe(3);

      // Verify part1, part2, part3 are still cached by checking again
      // part0 should have been evicted
      // We can verify by checking the status again - if evicted, it would be a fresh lookup
      const status1 = await checkCacheStatus('data/part1.parquet');
      const status2 = await checkCacheStatus('data/part2.parquet');
      const status3 = await checkCacheStatus('data/part3.parquet');

      expect(status1.cached).toBe(true);
      expect(status2.cached).toBe(true);
      expect(status3.cached).toBe(true);
    });

    it('should keep recently accessed entries', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      for (let i = 0; i < 5; i++) {
        mockResponses.set(`HEAD:https://cdn.workers.do/data/part${i}.parquet`, {
          status: 200,
          headers: new Headers({
            'CF-Cache-Status': 'HIT',
            'Content-Length': '1000',
          }),
        });
      }

      setFetchFunction(createMockFetch(mockResponses));

      // Add entries: part0, part1, part2
      await checkCacheStatus('data/part0.parquet');
      await checkCacheStatus('data/part1.parquet');
      await checkCacheStatus('data/part2.parquet');

      // Access part0 again (making it most recently used)
      await checkCacheStatus('data/part0.parquet');

      // Add part3 - should evict part1 (now the least recently used)
      await checkCacheStatus('data/part3.parquet');

      expect(getCacheStatusMapSize()).toBe(3);

      // part0 should still be cached (was recently accessed)
      const status0 = await checkCacheStatus('data/part0.parquet');
      expect(status0.cached).toBe(true);

      // part2 and part3 should be cached
      const status2 = await checkCacheStatus('data/part2.parquet');
      const status3 = await checkCacheStatus('data/part3.parquet');
      expect(status2.cached).toBe(true);
      expect(status3.cached).toBe(true);
    });

    it('should allow configuring max cache size', () => {
      expect(getCacheStatusMapMaxSize()).toBe(3); // Set in beforeEach

      setCacheStatusMapMaxSize(100);
      expect(getCacheStatusMapMaxSize()).toBe(100);

      setCacheStatusMapMaxSize(10000);
      expect(getCacheStatusMapMaxSize()).toBe(10000);
    });
  });
});
