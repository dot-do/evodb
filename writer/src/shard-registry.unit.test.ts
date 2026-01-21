/**
 * Tests for ShardRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ShardRegistry,
  createShardRegistry,
  type ShardMetadata,
} from './shard-registry.js';
import { ShardRouter, type ShardKey } from './shard-router.js';
import type { WriterStats, PartitionMode } from './types.js';

// Mock Response for test environment
function createMockResponse(body: unknown, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// Mock DurableObjectNamespace
function createMockNamespace(
  responsesByShardId: Record<string, Partial<WriterStats>>
): DurableObjectNamespace {
  return {
    idFromName: (name: string) => ({ toString: () => name }),
    get: (id: { toString: () => string }) => ({
      fetch: async (url: string) => {
        const path = new URL(url).pathname;
        const shardId = id.toString();
        const stats = responsesByShardId[shardId];

        if (path === '/stats' && stats) {
          return createMockResponse(stats, 200);
        }

        if (path === '/blocks') {
          return createMockResponse([], 200);
        }

        return createMockResponse({ error: 'Not found' }, 404);
      },
    }),
  } as unknown as DurableObjectNamespace;
}

// Helper to create mock WriterStats
function createMockStats(overrides: Partial<{
  blockCount: number;
  pendingBlockCount: number;
  totalRows: number;
  totalBytesR2: number;
  entryCount: number;
  partitionMode: PartitionMode;
}>): Partial<WriterStats> {
  return {
    buffer: {
      entryCount: overrides.entryCount ?? 0,
      estimatedSize: 0,
      ageMs: 0,
      sourceCount: 0,
      readyToFlush: false,
    },
    partitionMode: overrides.partitionMode ?? 'do-sqlite',
    blocks: {
      r2BlockCount: overrides.blockCount ?? 0,
      pendingBlockCount: overrides.pendingBlockCount ?? 0,
      smallBlockCount: 0,
      totalRows: overrides.totalRows ?? 0,
      totalBytesR2: overrides.totalBytesR2 ?? 0,
    },
    operations: {
      cdcEntriesReceived: 0,
      flushCount: 0,
      compactCount: 0,
      r2WriteFailures: 0,
      retryCount: 0,
    },
    timing: {
      lastFlushTime: null,
      lastCompactTime: null,
      avgFlushDurationMs: 0,
      avgCompactDurationMs: 0,
    },
    sources: new Map(),
  };
}

describe('ShardRegistry', () => {
  let router: ShardRouter;

  beforeEach(() => {
    router = new ShardRouter({
      shardCount: 4,
      namespaceBinding: 'WRITER_SHARDS',
    });
  });

  describe('construction', () => {
    it('should create registry with router and namespace', () => {
      const namespace = createMockNamespace({});
      const registry = new ShardRegistry(router, namespace);

      expect(registry.shardCount).toBe(4);
      expect(registry.getRouter()).toBe(router);
    });

    it('should accept custom options', () => {
      const namespace = createMockNamespace({});
      const registry = new ShardRegistry(router, namespace, {
        cacheTtlMs: 60000,
        queryTimeoutMs: 10000,
      });

      expect(registry.shardCount).toBe(4);
    });
  });

  describe('getShardMetadata', () => {
    it('should fetch metadata for a shard', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({
          blockCount: 10,
          totalRows: 1000,
          totalBytesR2: 50000,
        }),
      });

      const registry = new ShardRegistry(router, namespace);
      const metadata = await registry.getShardMetadata(0);

      expect(metadata.shardNumber).toBe(0);
      expect(metadata.shardId).toBe('shard-0000');
      expect(metadata.blockCount).toBe(10);
      expect(metadata.totalRows).toBe(1000);
      expect(metadata.totalBytesR2).toBe(50000);
    });

    it('should cache metadata', async () => {
      let fetchCount = 0;
      const namespace = {
        idFromName: (name: string) => ({ toString: () => name }),
        get: () => ({
          fetch: async () => {
            fetchCount++;
            return new Response(JSON.stringify(createMockStats({})), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          },
        }),
      } as unknown as DurableObjectNamespace;

      const registry = new ShardRegistry(router, namespace);

      await registry.getShardMetadata(0);
      await registry.getShardMetadata(0);
      await registry.getShardMetadata(0);

      // Should only fetch once due to caching
      expect(fetchCount).toBe(1);
    });

    it('should bypass cache with forceRefresh', async () => {
      let fetchCount = 0;
      const namespace = {
        idFromName: (name: string) => ({ toString: () => name }),
        get: () => ({
          fetch: async () => {
            fetchCount++;
            return new Response(JSON.stringify(createMockStats({})), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          },
        }),
      } as unknown as DurableObjectNamespace;

      const registry = new ShardRegistry(router, namespace);

      await registry.getShardMetadata(0);
      await registry.getShardMetadata(0, true);

      expect(fetchCount).toBe(2);
    });

    it('should return unhealthy status on fetch error', async () => {
      const namespace = {
        idFromName: (name: string) => ({ toString: () => name }),
        get: () => ({
          fetch: async () => {
            throw new Error('Connection failed');
          },
        }),
      } as unknown as DurableObjectNamespace;

      const registry = new ShardRegistry(router, namespace);
      const metadata = await registry.getShardMetadata(0);

      expect(metadata.status).toBe('unhealthy');
      expect(metadata.blockCount).toBe(0);
    });
  });

  describe('getAllShardMetadata', () => {
    it('should fetch metadata for all shards', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ blockCount: 10 }),
        'shard-0001': createMockStats({ blockCount: 20 }),
        'shard-0002': createMockStats({ blockCount: 30 }),
        'shard-0003': createMockStats({ blockCount: 40 }),
      });

      const registry = new ShardRegistry(router, namespace);
      const allMetadata = await registry.getAllShardMetadata();

      expect(allMetadata).toHaveLength(4);
      expect(allMetadata[0].blockCount).toBe(10);
      expect(allMetadata[1].blockCount).toBe(20);
      expect(allMetadata[2].blockCount).toBe(30);
      expect(allMetadata[3].blockCount).toBe(40);
    });
  });

  describe('getRegistryStats', () => {
    it('should aggregate statistics from all shards', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ blockCount: 10, totalRows: 100, totalBytesR2: 1000 }),
        'shard-0001': createMockStats({ blockCount: 20, totalRows: 200, totalBytesR2: 2000 }),
        'shard-0002': createMockStats({ blockCount: 30, totalRows: 300, totalBytesR2: 3000 }),
        'shard-0003': createMockStats({ blockCount: 40, totalRows: 400, totalBytesR2: 4000 }),
      });

      const registry = new ShardRegistry(router, namespace);
      const stats = await registry.getRegistryStats();

      expect(stats.totalShards).toBe(4);
      expect(stats.totalBlocks).toBe(100); // 10+20+30+40
      expect(stats.totalRows).toBe(1000); // 100+200+300+400
      expect(stats.totalBytesR2).toBe(10000); // 1000+2000+3000+4000
      expect(stats.avgBlocksPerShard).toBe(25);
      expect(stats.maxBlocksOnShard).toBe(40);
      expect(stats.minBlocksOnShard).toBe(10);
    });

    it('should count healthy/degraded/unhealthy shards', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ pendingBlockCount: 0 }), // healthy
        'shard-0001': createMockStats({ pendingBlockCount: 5 }), // degraded
        'shard-0002': createMockStats({ pendingBlockCount: 15 }), // unhealthy
        'shard-0003': createMockStats({ pendingBlockCount: 0 }), // healthy
      });

      const registry = new ShardRegistry(router, namespace);
      const stats = await registry.getRegistryStats();

      expect(stats.healthyShards).toBe(2);
      expect(stats.degradedShards).toBe(1);
      expect(stats.unhealthyShards).toBe(1);
    });

    it('should calculate standard deviation of block distribution', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ blockCount: 10 }),
        'shard-0001': createMockStats({ blockCount: 10 }),
        'shard-0002': createMockStats({ blockCount: 10 }),
        'shard-0003': createMockStats({ blockCount: 10 }),
      });

      const registry = new ShardRegistry(router, namespace);
      const stats = await registry.getRegistryStats();

      // With equal distribution, stdDev should be 0
      expect(stats.blockDistributionStdDev).toBe(0);
    });
  });

  describe('findShardsForKey', () => {
    it('should find shard for a specific tenant/table', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ blockCount: 10 }),
        'shard-0001': createMockStats({ blockCount: 20 }),
        'shard-0002': createMockStats({ blockCount: 30 }),
        'shard-0003': createMockStats({ blockCount: 40 }),
      });

      const registry = new ShardRegistry(router, namespace);
      const key: ShardKey = { tenant: 'acme', table: 'users' };
      const result = await registry.findShardsForKey(key);

      expect(result.shards).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);

      // Verify the shard matches what router would return
      const expectedShard = router.getShard(key);
      expect(result.shards[0].shardNumber).toBe(expectedShard.shardNumber);
    });
  });

  describe('getShardInfo', () => {
    it('should return shard info without fetching', () => {
      const namespace = createMockNamespace({});
      const registry = new ShardRegistry(router, namespace);

      const key: ShardKey = { tenant: 'test', table: 'data' };
      const info = registry.getShardInfo(key);

      expect(info.shardNumber).toBeGreaterThanOrEqual(0);
      expect(info.shardNumber).toBeLessThan(4);
      expect(info.key).toEqual(key);
    });
  });

  describe('getHealthyShards', () => {
    it('should return only healthy shards', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ pendingBlockCount: 0 }),
        'shard-0001': createMockStats({ pendingBlockCount: 15 }), // unhealthy
        'shard-0002': createMockStats({ pendingBlockCount: 0 }),
        'shard-0003': createMockStats({ pendingBlockCount: 5 }), // degraded
      });

      const registry = new ShardRegistry(router, namespace);
      const healthy = await registry.getHealthyShards();

      expect(healthy).toHaveLength(2);
      expect(healthy.every(s => s.status === 'healthy')).toBe(true);
    });
  });

  describe('getProblematicShards', () => {
    it('should return degraded and unhealthy shards', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ pendingBlockCount: 0 }),
        'shard-0001': createMockStats({ pendingBlockCount: 15 }), // unhealthy
        'shard-0002': createMockStats({ pendingBlockCount: 0 }),
        'shard-0003': createMockStats({ pendingBlockCount: 5 }), // degraded
      });

      const registry = new ShardRegistry(router, namespace);
      const problematic = await registry.getProblematicShards();

      expect(problematic).toHaveLength(2);
      expect(problematic.every(s => s.status !== 'healthy')).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({}),
      });

      const registry = new ShardRegistry(router, namespace);

      await registry.getShardMetadata(0);
      expect(registry.getCacheStats().size).toBe(1);

      registry.clearCache();
      expect(registry.getCacheStats().size).toBe(0);
    });
  });

  describe('createShardRegistry factory', () => {
    it('should create registry with router and namespace', () => {
      const namespace = createMockNamespace({});
      const registry = createShardRegistry(router, namespace);

      expect(registry.shardCount).toBe(4);
    });
  });

  describe('health status determination', () => {
    it('should mark shard as healthy when no pending blocks', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ pendingBlockCount: 0, entryCount: 100 }),
      });

      const registry = new ShardRegistry(router, namespace);
      const metadata = await registry.getShardMetadata(0);

      expect(metadata.status).toBe('healthy');
    });

    it('should mark shard as degraded when some pending blocks exist', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ pendingBlockCount: 5 }),
      });

      const registry = new ShardRegistry(router, namespace);
      const metadata = await registry.getShardMetadata(0);

      expect(metadata.status).toBe('degraded');
    });

    it('should mark shard as degraded when buffer is very full', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ pendingBlockCount: 0, entryCount: 60000 }),
      });

      const registry = new ShardRegistry(router, namespace);
      const metadata = await registry.getShardMetadata(0);

      expect(metadata.status).toBe('degraded');
    });

    it('should mark shard as unhealthy when many pending blocks', async () => {
      const namespace = createMockNamespace({
        'shard-0000': createMockStats({ pendingBlockCount: 15 }),
      });

      const registry = new ShardRegistry(router, namespace);
      const metadata = await registry.getShardMetadata(0);

      expect(metadata.status).toBe('unhealthy');
    });
  });
});
