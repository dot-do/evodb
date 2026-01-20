/**
 * Tests for ShardRouter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShardRouter,
  createShardRouter,
  RECOMMENDED_SHARD_COUNTS,
  type ShardRouterConfig,
  type ShardKey,
} from './shard-router.js';

describe('ShardRouter', () => {
  describe('construction', () => {
    it('should create router with valid shard count', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
      });

      expect(router.shardCount).toBe(16);
    });

    it('should throw for shard count less than 1', () => {
      expect(() => new ShardRouter({
        shardCount: 0,
        namespaceBinding: 'WRITER_SHARDS',
      })).toThrow('shardCount must be at least 1');
    });

    it('should throw for shard count greater than 65536', () => {
      expect(() => new ShardRouter({
        shardCount: 100000,
        namespaceBinding: 'WRITER_SHARDS',
      })).toThrow('shardCount must not exceed 65536');
    });

    it('should accept custom shard ID prefix', () => {
      const router = new ShardRouter({
        shardCount: 4,
        namespaceBinding: 'WRITER_SHARDS',
        shardIdPrefix: 'writer',
      });

      const shardId = router.generateShardId(0);
      expect(shardId).toBe('writer-0000');
    });
  });

  describe('getShard', () => {
    let router: ShardRouter;

    beforeEach(() => {
      router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
      });
    });

    it('should return consistent shard for same key', () => {
      const key: ShardKey = { tenant: 'acme', table: 'users' };

      const shard1 = router.getShard(key);
      const shard2 = router.getShard(key);

      expect(shard1.shardNumber).toBe(shard2.shardNumber);
      expect(shard1.shardId).toBe(shard2.shardId);
      expect(shard1.hashValue).toBe(shard2.hashValue);
    });

    it('should return shard number in valid range', () => {
      const key: ShardKey = { tenant: 'test', table: 'data' };
      const shard = router.getShard(key);

      expect(shard.shardNumber).toBeGreaterThanOrEqual(0);
      expect(shard.shardNumber).toBeLessThan(16);
    });

    it('should include original key in shard info', () => {
      const key: ShardKey = { tenant: 'acme', table: 'users' };
      const shard = router.getShard(key);

      expect(shard.key).toEqual(key);
    });

    it('should generate valid shard ID', () => {
      const key: ShardKey = { tenant: 'acme', table: 'users' };
      const shard = router.getShard(key);

      expect(shard.shardId).toMatch(/^shard-\d{4}$/);
    });

    it('should distribute different keys across shards', () => {
      const shardsUsed = new Set<number>();

      // Generate many keys to check distribution
      for (let i = 0; i < 100; i++) {
        const key: ShardKey = { tenant: `tenant-${i}`, table: 'data' };
        const shard = router.getShard(key);
        shardsUsed.add(shard.shardNumber);
      }

      // With 100 random keys across 16 shards, we should hit most shards
      expect(shardsUsed.size).toBeGreaterThan(10);
    });
  });

  describe('getShardNumber', () => {
    let router: ShardRouter;

    beforeEach(() => {
      router = new ShardRouter({
        shardCount: 8,
        namespaceBinding: 'WRITER_SHARDS',
      });
    });

    it('should return consistent shard number for same key', () => {
      const num1 = router.getShardNumber('test-key');
      const num2 = router.getShardNumber('test-key');

      expect(num1).toBe(num2);
    });

    it('should return number in valid range', () => {
      const num = router.getShardNumber('any-key');

      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThan(8);
    });
  });

  describe('generateShardId / parseShardId', () => {
    let router: ShardRouter;

    beforeEach(() => {
      router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
        shardIdPrefix: 'shard',
      });
    });

    it('should generate padded shard IDs', () => {
      expect(router.generateShardId(0)).toBe('shard-0000');
      expect(router.generateShardId(1)).toBe('shard-0001');
      expect(router.generateShardId(15)).toBe('shard-0015');
    });

    it('should throw for invalid shard numbers', () => {
      expect(() => router.generateShardId(-1)).toThrow('out of range');
      expect(() => router.generateShardId(16)).toThrow('out of range');
    });

    it('should parse valid shard IDs', () => {
      expect(router.parseShardId('shard-0000')).toBe(0);
      expect(router.parseShardId('shard-0001')).toBe(1);
      expect(router.parseShardId('shard-0015')).toBe(15);
    });

    it('should return null for invalid shard IDs', () => {
      expect(router.parseShardId('invalid')).toBeNull();
      expect(router.parseShardId('other-0001')).toBeNull();
      expect(router.parseShardId('shard-0016')).toBeNull();
      expect(router.parseShardId('shard-abc')).toBeNull();
    });
  });

  describe('distribution analysis', () => {
    it('should provide distribution statistics', () => {
      const router = new ShardRouter({
        shardCount: 4,
        namespaceBinding: 'WRITER_SHARDS',
      });

      const keys: ShardKey[] = [
        { tenant: 'acme', table: 'users' },
        { tenant: 'acme', table: 'orders' },
        { tenant: 'beta', table: 'users' },
        { tenant: 'gamma', table: 'products' },
      ];

      const stats = router.getDistributionStats(keys);

      expect(stats).toHaveLength(4);

      // Each stat should have the right structure
      for (const stat of stats) {
        expect(stat.shardNumber).toBeGreaterThanOrEqual(0);
        expect(stat.shardNumber).toBeLessThan(4);
        expect(stat.tenantCount).toBeGreaterThanOrEqual(0);
        expect(stat.tableCount).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(stat.keys)).toBe(true);
      }

      // Total keys should equal input
      const totalKeys = stats.reduce((sum, s) => sum + s.keys.length, 0);
      expect(totalKeys).toBe(4);
    });

    it('should track unique tenants per shard', () => {
      const router = new ShardRouter({
        shardCount: 2,
        namespaceBinding: 'WRITER_SHARDS',
      });

      // Create multiple tables for same tenant
      const keys: ShardKey[] = [
        { tenant: 'acme', table: 'users' },
        { tenant: 'acme', table: 'orders' },
        { tenant: 'acme', table: 'products' },
      ];

      const stats = router.getDistributionStats(keys);

      // Find all shards with acme's data
      const shardsWithAcme = stats.filter(s => s.keys.some(k => k.tenant === 'acme'));

      // All acme tables might be on one shard or distributed across shards
      // But total acme tables across all shards should be 3
      const totalAcmeTables = shardsWithAcme.reduce((sum, s) =>
        sum + s.keys.filter(k => k.tenant === 'acme').length, 0);
      expect(totalAcmeTables).toBe(3);

      // Each shard with acme data should have tenantCount of 1 for acme
      // (since we only have one tenant in this test)
      for (const shard of shardsWithAcme) {
        expect(shard.tenantCount).toBe(1);
      }
    });
  });

  describe('colocation checking', () => {
    let router: ShardRouter;

    beforeEach(() => {
      router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
      });
    });

    it('should correctly identify colocated keys', () => {
      const key1: ShardKey = { tenant: 'acme', table: 'users' };
      const key2: ShardKey = { tenant: 'acme', table: 'users' };

      expect(router.areColocated(key1, key2)).toBe(true);
    });

    it('should identify keys that hash to same shard', () => {
      // Find two keys that route to the same shard
      const key1: ShardKey = { tenant: 'test1', table: 'data' };
      const shard1 = router.getShard(key1);

      // Search for another key that routes to the same shard
      let foundColocated = false;
      for (let i = 0; i < 100; i++) {
        const key2: ShardKey = { tenant: `search-${i}`, table: 'data' };
        const shard2 = router.getShard(key2);

        if (shard1.shardNumber === shard2.shardNumber && key1.tenant !== key2.tenant) {
          expect(router.areColocated(key1, key2)).toBe(true);
          foundColocated = true;
          break;
        }
      }

      // With 16 shards and 100 tries, we should find a collision
      expect(foundColocated).toBe(true);
    });
  });

  describe('key filtering', () => {
    let router: ShardRouter;

    beforeEach(() => {
      router = new ShardRouter({
        shardCount: 4,
        namespaceBinding: 'WRITER_SHARDS',
      });
    });

    it('should filter keys by shard number', () => {
      const keys: ShardKey[] = [];
      for (let i = 0; i < 20; i++) {
        keys.push({ tenant: `tenant-${i}`, table: 'data' });
      }

      const filtered = router.getKeysForShard(keys, 0);

      // All filtered keys should route to shard 0
      for (const key of filtered) {
        expect(router.getShard(key).shardNumber).toBe(0);
      }
    });
  });

  describe('caching', () => {
    let router: ShardRouter;

    beforeEach(() => {
      router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
      });
    });

    it('should cache routing results', () => {
      const key: ShardKey = { tenant: 'acme', table: 'users' };

      expect(router.getCacheSize()).toBe(0);

      router.getShard(key);
      expect(router.getCacheSize()).toBe(1);

      // Calling again should not increase cache size
      router.getShard(key);
      expect(router.getCacheSize()).toBe(1);
    });

    it('should clear cache', () => {
      const key: ShardKey = { tenant: 'acme', table: 'users' };

      router.getShard(key);
      expect(router.getCacheSize()).toBe(1);

      router.clearCache();
      expect(router.getCacheSize()).toBe(0);
    });
  });

  describe('LRU cache eviction', () => {
    it('should enforce max cache size', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
        maxCacheSize: 5,
      });

      // Add 10 entries
      for (let i = 0; i < 10; i++) {
        router.getShard({ tenant: `tenant-${i}`, table: 'data' });
      }

      // Cache size should not exceed maxCacheSize
      expect(router.getCacheSize()).toBe(5);
    });

    it('should evict oldest entries when cache is full', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
        maxCacheSize: 3,
      });

      // Add entries in order: tenant-0, tenant-1, tenant-2
      router.getShard({ tenant: 'tenant-0', table: 'data' });
      router.getShard({ tenant: 'tenant-1', table: 'data' });
      router.getShard({ tenant: 'tenant-2', table: 'data' });

      expect(router.getCacheSize()).toBe(3);

      // Add a new entry - should evict tenant-0 (oldest)
      router.getShard({ tenant: 'tenant-3', table: 'data' });

      expect(router.getCacheSize()).toBe(3);

      // Verify tenant-0 was evicted by checking it's not a cache hit
      // (We can verify this by checking the cache doesn't contain that key)
      expect(router.isCached({ tenant: 'tenant-0', table: 'data' })).toBe(false);
      expect(router.isCached({ tenant: 'tenant-1', table: 'data' })).toBe(true);
      expect(router.isCached({ tenant: 'tenant-2', table: 'data' })).toBe(true);
      expect(router.isCached({ tenant: 'tenant-3', table: 'data' })).toBe(true);
    });

    it('should keep recently accessed entries', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
        maxCacheSize: 3,
      });

      // Add entries in order: tenant-0, tenant-1, tenant-2
      router.getShard({ tenant: 'tenant-0', table: 'data' });
      router.getShard({ tenant: 'tenant-1', table: 'data' });
      router.getShard({ tenant: 'tenant-2', table: 'data' });

      // Access tenant-0 again (making it most recently used)
      router.getShard({ tenant: 'tenant-0', table: 'data' });

      // Add a new entry - should evict tenant-1 (now the least recently used)
      router.getShard({ tenant: 'tenant-3', table: 'data' });

      expect(router.getCacheSize()).toBe(3);

      // tenant-0 should still be cached (was recently accessed)
      expect(router.isCached({ tenant: 'tenant-0', table: 'data' })).toBe(true);
      // tenant-1 should be evicted (least recently used)
      expect(router.isCached({ tenant: 'tenant-1', table: 'data' })).toBe(false);
      // tenant-2 and tenant-3 should be cached
      expect(router.isCached({ tenant: 'tenant-2', table: 'data' })).toBe(true);
      expect(router.isCached({ tenant: 'tenant-3', table: 'data' })).toBe(true);
    });

    it('should use default max cache size when not specified', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
      });

      // Default should be 10000 - add more than that
      // (For this test we just verify the router has a maxCacheSize set)
      expect(router.getMaxCacheSize()).toBe(10000);
    });

    it('should accept custom max cache size', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
        maxCacheSize: 500,
      });

      expect(router.getMaxCacheSize()).toBe(500);
    });

    it('should still return correct shard info after eviction and re-lookup', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
        maxCacheSize: 2,
      });

      // Get shard info for tenant-0
      const originalInfo = router.getShard({ tenant: 'tenant-0', table: 'data' });

      // Fill cache to evict tenant-0
      router.getShard({ tenant: 'tenant-1', table: 'data' });
      router.getShard({ tenant: 'tenant-2', table: 'data' });

      // tenant-0 should be evicted now
      expect(router.isCached({ tenant: 'tenant-0', table: 'data' })).toBe(false);

      // Re-lookup tenant-0 - should get same shard info (hash is deterministic)
      const newInfo = router.getShard({ tenant: 'tenant-0', table: 'data' });

      expect(newInfo.shardNumber).toBe(originalInfo.shardNumber);
      expect(newInfo.shardId).toBe(originalInfo.shardId);
      expect(newInfo.hashValue).toBe(originalInfo.hashValue);
    });
  });

  describe('configuration export', () => {
    it('should export configuration', () => {
      const router = new ShardRouter({
        shardCount: 32,
        namespaceBinding: 'WRITER_SHARDS',
        shardIdPrefix: 'writer',
        virtualNodesPerShard: 10,
      });

      const config = router.toConfig();

      expect(config.shardCount).toBe(32);
      expect(config.namespaceBinding).toBe('WRITER_SHARDS');
      expect(config.shardIdPrefix).toBe('writer');
      expect(config.virtualNodesPerShard).toBe(10);
    });
  });

  describe('power of 2 optimization', () => {
    it('should work with power of 2 shard counts', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
      });

      // Should use bitwise AND for fast modulo
      for (let i = 0; i < 100; i++) {
        const key: ShardKey = { tenant: `t${i}`, table: 'd' };
        const shard = router.getShard(key);
        expect(shard.shardNumber).toBeGreaterThanOrEqual(0);
        expect(shard.shardNumber).toBeLessThan(16);
      }
    });

    it('should work with non-power of 2 shard counts', () => {
      const router = new ShardRouter({
        shardCount: 10,
        namespaceBinding: 'WRITER_SHARDS',
      });

      // Should use modulo
      for (let i = 0; i < 100; i++) {
        const key: ShardKey = { tenant: `t${i}`, table: 'd' };
        const shard = router.getShard(key);
        expect(shard.shardNumber).toBeGreaterThanOrEqual(0);
        expect(shard.shardNumber).toBeLessThan(10);
      }
    });
  });

  describe('createShardRouter factory', () => {
    it('should create router with default binding', () => {
      const router = createShardRouter(8);
      expect(router.shardCount).toBe(8);
    });

    it('should create router with custom binding', () => {
      const router = createShardRouter(4, 'CUSTOM_SHARDS');
      expect(router.shardCount).toBe(4);
    });
  });

  describe('RECOMMENDED_SHARD_COUNTS', () => {
    it('should have appropriate values for different scales', () => {
      expect(RECOMMENDED_SHARD_COUNTS.small).toBe(4);
      expect(RECOMMENDED_SHARD_COUNTS.medium).toBe(16);
      expect(RECOMMENDED_SHARD_COUNTS.large).toBe(64);
      expect(RECOMMENDED_SHARD_COUNTS.enterprise).toBe(256);
    });

    it('should all be powers of 2', () => {
      for (const [_scale, count] of Object.entries(RECOMMENDED_SHARD_COUNTS)) {
        expect((count & (count - 1))).toBe(0);
      }
    });
  });

  describe('hash distribution quality', () => {
    it('should have good distribution across shards', () => {
      const router = new ShardRouter({
        shardCount: 16,
        namespaceBinding: 'WRITER_SHARDS',
      });

      const shardCounts = new Array(16).fill(0);

      // Generate many keys
      for (let i = 0; i < 10000; i++) {
        const key: ShardKey = { tenant: `tenant-${i}`, table: `table-${i % 100}` };
        const shard = router.getShard(key);
        shardCounts[shard.shardNumber]++;
      }

      // Check distribution - each shard should have roughly 10000/16 = 625 keys
      // Allow for some variance (within 50%)
      const expected = 10000 / 16;
      const minAllowed = expected * 0.5;
      const maxAllowed = expected * 1.5;

      for (const count of shardCounts) {
        expect(count).toBeGreaterThan(minAllowed);
        expect(count).toBeLessThan(maxAllowed);
      }

      // Calculate coefficient of variation
      const mean = shardCounts.reduce((a, b) => a + b, 0) / shardCounts.length;
      const variance = shardCounts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / shardCounts.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / mean;

      // CV should be low for good distribution (< 0.2)
      expect(cv).toBeLessThan(0.2);
    });
  });
});
