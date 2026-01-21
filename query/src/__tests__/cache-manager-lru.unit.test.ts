/**
 * Tests for CacheManager LRU eviction behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from '../engine.js';
import type { QueryEngineConfig, PartitionInfo, R2Bucket } from '../types.js';

// Mock R2 bucket
function createMockBucket(): R2Bucket {
  return {
    get: async (key: string) => {
      return {
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
      } as unknown as import('@cloudflare/workers-types').R2ObjectBody;
    },
    put: async () => null,
    delete: async () => {},
    list: async () => ({ objects: [], truncated: false, cursor: undefined }),
    head: async () => null,
    createMultipartUpload: async () => ({ key: '', uploadId: '' }),
    resumeMultipartUpload: () => ({ uploadId: '', key: '', uploadPart: async () => ({ etag: '', partNumber: 0 }), complete: async () => null, abort: async () => {} }),
  } as unknown as R2Bucket;
}

function createTestConfig(maxEntries?: number): QueryEngineConfig {
  return {
    bucket: createMockBucket(),
    basePath: 'data',
    cache: {
      enabled: true,
      ttlSeconds: 3600,
      maxSizeBytes: 1024 * 1024,
      maxEntries: maxEntries ?? 1000,
      keyPrefix: 'test:',
    },
  };
}

function createPartition(path: string, sizeBytes: number = 100): PartitionInfo {
  return {
    path,
    partitionValues: {},
    sizeBytes,
    rowCount: 10,
    zoneMap: { columns: {} },
    isCached: false,
  };
}

describe('CacheManager LRU eviction', () => {
  describe('max entries configuration', () => {
    it('should use default max entries when not specified', () => {
      const config = createTestConfig();
      delete config.cache!.maxEntries;
      const cache = new CacheManager(config);

      expect(cache.getMaxEntries()).toBe(1000);
    });

    it('should accept custom max entries', () => {
      const cache = new CacheManager(createTestConfig(500));
      expect(cache.getMaxEntries()).toBe(500);
    });
  });

  describe('LRU eviction behavior', () => {
    let cache: CacheManager;

    beforeEach(() => {
      // Use a small max size for testing
      cache = new CacheManager(createTestConfig(3));
    });

    it('should enforce max cache size', async () => {
      // Add 5 entries to cache with max size of 3
      for (let i = 0; i < 5; i++) {
        await cache.getPartitionData(createPartition(`partition${i}.parquet`));
      }

      // Cache size should not exceed maxEntries (3)
      expect(cache.getCacheSize()).toBe(3);
    });

    it('should evict oldest entries when cache is full', async () => {
      // Add entries: p0, p1, p2
      const p0 = createPartition('p0.parquet');
      const p1 = createPartition('p1.parquet');
      const p2 = createPartition('p2.parquet');
      const p3 = createPartition('p3.parquet');

      await cache.getPartitionData(p0);
      await cache.getPartitionData(p1);
      await cache.getPartitionData(p2);

      expect(cache.getCacheSize()).toBe(3);

      // Add p3 - should evict p0 (oldest)
      await cache.getPartitionData(p3);

      expect(cache.getCacheSize()).toBe(3);

      // p0 should have been evicted (isCached check)
      expect(await cache.isCached(p0)).toBe(false);
      expect(await cache.isCached(p1)).toBe(true);
      expect(await cache.isCached(p2)).toBe(true);
      expect(await cache.isCached(p3)).toBe(true);
    });

    it('should keep recently accessed entries', async () => {
      const p0 = createPartition('p0.parquet');
      const p1 = createPartition('p1.parquet');
      const p2 = createPartition('p2.parquet');
      const p3 = createPartition('p3.parquet');

      // Add entries: p0, p1, p2
      await cache.getPartitionData(p0);
      await cache.getPartitionData(p1);
      await cache.getPartitionData(p2);

      // Access p0 again (making it most recently used)
      const result0 = await cache.getPartitionData(p0);
      expect(result0.fromCache).toBe(true);

      // Add p3 - should evict p1 (now the least recently used)
      await cache.getPartitionData(p3);

      expect(cache.getCacheSize()).toBe(3);

      // p0 should still be cached (was recently accessed)
      expect(await cache.isCached(p0)).toBe(true);
      // p1 should be evicted (least recently used)
      expect(await cache.isCached(p1)).toBe(false);
      // p2 and p3 should be cached
      expect(await cache.isCached(p2)).toBe(true);
      expect(await cache.isCached(p3)).toBe(true);
    });

    it('should update position on cache hit', async () => {
      const p0 = createPartition('p0.parquet');
      const p1 = createPartition('p1.parquet');
      const p2 = createPartition('p2.parquet');
      const p3 = createPartition('p3.parquet');
      const p4 = createPartition('p4.parquet');

      // Add entries: p0, p1, p2
      await cache.getPartitionData(p0);
      await cache.getPartitionData(p1);
      await cache.getPartitionData(p2);

      // Access p0 (moves to end)
      await cache.getPartitionData(p0);
      // Access p1 (moves to end)
      await cache.getPartitionData(p1);

      // Now order should be: p2, p0, p1
      // Adding p3 should evict p2 (first/oldest)
      await cache.getPartitionData(p3);

      expect(await cache.isCached(p0)).toBe(true);
      expect(await cache.isCached(p1)).toBe(true);
      expect(await cache.isCached(p2)).toBe(false);
      expect(await cache.isCached(p3)).toBe(true);

      // Adding p4 should evict p0 (now first)
      await cache.getPartitionData(p4);

      expect(await cache.isCached(p0)).toBe(false);
      expect(await cache.isCached(p1)).toBe(true);
      expect(await cache.isCached(p3)).toBe(true);
      expect(await cache.isCached(p4)).toBe(true);
    });

    it('should return correct data after eviction and re-fetch', async () => {
      const p0 = createPartition('p0.parquet');
      const p1 = createPartition('p1.parquet');
      const p2 = createPartition('p2.parquet');
      const p3 = createPartition('p3.parquet');

      // Add entries: p0, p1, p2
      const result0First = await cache.getPartitionData(p0);
      expect(result0First.fromCache).toBe(false);

      await cache.getPartitionData(p1);
      await cache.getPartitionData(p2);

      // Add p3 - evicts p0
      await cache.getPartitionData(p3);

      // p0 should be evicted
      expect(await cache.isCached(p0)).toBe(false);

      // Re-fetch p0 - should come from R2 (not cache)
      const result0Second = await cache.getPartitionData(p0);
      expect(result0Second.fromCache).toBe(false);
      expect(result0Second.data).toBeInstanceOf(ArrayBuffer);
    });
  });

  describe('cache statistics', () => {
    it('should track hits and misses correctly with LRU eviction', async () => {
      const cache = new CacheManager(createTestConfig(2));
      const p0 = createPartition('p0.parquet');
      const p1 = createPartition('p1.parquet');
      const p2 = createPartition('p2.parquet');

      // First access - miss
      await cache.getPartitionData(p0);
      expect(cache.getStats().misses).toBe(1);
      expect(cache.getStats().hits).toBe(0);

      // Second access to p0 - hit
      await cache.getPartitionData(p0);
      expect(cache.getStats().hits).toBe(1);

      // Add p1 and p2 (evicts p0)
      await cache.getPartitionData(p1);
      await cache.getPartitionData(p2);

      // Access p0 again - miss (was evicted)
      await cache.getPartitionData(p0);
      expect(cache.getStats().misses).toBe(4);
    });
  });

  describe('prefetch with LRU', () => {
    it('should respect LRU eviction during prefetch', async () => {
      const cache = new CacheManager(createTestConfig(3));

      const partitions = [
        createPartition('p0.parquet'),
        createPartition('p1.parquet'),
        createPartition('p2.parquet'),
        createPartition('p3.parquet'),
        createPartition('p4.parquet'),
      ];

      // Prefetch 5 partitions into cache with max 3
      await cache.prefetch(partitions);

      // Only last 3 should be cached
      expect(cache.getCacheSize()).toBe(3);
      expect(await cache.isCached(partitions[0])).toBe(false);
      expect(await cache.isCached(partitions[1])).toBe(false);
      expect(await cache.isCached(partitions[2])).toBe(true);
      expect(await cache.isCached(partitions[3])).toBe(true);
      expect(await cache.isCached(partitions[4])).toBe(true);
    });
  });
});
