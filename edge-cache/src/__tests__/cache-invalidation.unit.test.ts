/**
 * Tests for cache invalidation hooks
 *
 * TDD: Testing cache invalidation tied to CDC commits
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearCacheStatusMap } from '../prefetch.js';
import {
  CacheInvalidationManager,
  createCacheInvalidationManager,
  setFetchFunction,
  resetFetchFunction,
  type CacheInvalidationHook,
  type CDCCommitEvent,
  type InvalidationResult,
  type InvalidationScope,
  type InvalidationStrategy,
} from '../cache-invalidation.js';

// Mock fetch function for tests
function createMockFetch(responses: Map<string, { status: number; headers: Headers }>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    const key = `${method}:${url}`;
    const response = responses.get(key) ?? responses.get(`*:${url}`);

    if (!response) {
      return new Response(null, { status: 404 });
    }

    return new Response(null, {
      status: response.status,
      headers: response.headers,
    });
  };
}

describe('Cache Invalidation Hooks', () => {
  beforeEach(() => {
    clearCacheStatusMap();
  });

  afterEach(() => {
    resetFetchFunction();
    vi.restoreAllMocks();
  });

  describe('CDCCommitEvent', () => {
    it('should define all required fields for a commit event', () => {
      const event: CDCCommitEvent = {
        table: 'users',
        partition: 'year=2024/month=01',
        snapshotId: 'snap_001',
        affectedPaths: [
          'data/users/year=2024/month=01/block_001.parquet',
          'data/users/year=2024/month=01/block_002.parquet',
        ],
        timestamp: Date.now(),
        operation: 'write',
        metadata: {
          rowCount: 1000,
          sizeBytes: 50000,
        },
      };

      expect(event.table).toBe('users');
      expect(event.partition).toBe('year=2024/month=01');
      expect(event.affectedPaths).toHaveLength(2);
      expect(event.operation).toBe('write');
    });

    it('should support different operation types', () => {
      const writeEvent: CDCCommitEvent = {
        table: 'orders',
        partition: 'year=2024',
        snapshotId: 'snap_002',
        affectedPaths: ['data/orders/block.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      };

      const compactEvent: CDCCommitEvent = {
        table: 'orders',
        partition: 'year=2024',
        snapshotId: 'snap_003',
        affectedPaths: ['data/orders/compact_block.parquet'],
        timestamp: Date.now(),
        operation: 'compact',
      };

      const deleteEvent: CDCCommitEvent = {
        table: 'orders',
        partition: 'year=2024',
        snapshotId: 'snap_004',
        affectedPaths: ['data/orders/old_block.parquet'],
        timestamp: Date.now(),
        operation: 'delete',
      };

      expect(writeEvent.operation).toBe('write');
      expect(compactEvent.operation).toBe('compact');
      expect(deleteEvent.operation).toBe('delete');
    });
  });

  describe('InvalidationScope', () => {
    it('should support partition-level scope', () => {
      const scope: InvalidationScope = {
        level: 'partition',
        table: 'users',
        partition: 'year=2024/month=01',
      };

      expect(scope.level).toBe('partition');
      expect(scope.partition).toBe('year=2024/month=01');
    });

    it('should support table-level scope', () => {
      const scope: InvalidationScope = {
        level: 'table',
        table: 'users',
      };

      expect(scope.level).toBe('table');
      expect(scope.partition).toBeUndefined();
    });

    it('should support path-level scope', () => {
      const scope: InvalidationScope = {
        level: 'path',
        table: 'users',
        paths: [
          'data/users/year=2024/block_001.parquet',
          'data/users/year=2024/block_002.parquet',
        ],
      };

      expect(scope.level).toBe('path');
      expect(scope.paths).toHaveLength(2);
    });
  });

  describe('CacheInvalidationHook', () => {
    it('should define hook interface with onCommit callback', async () => {
      const hookCalls: CDCCommitEvent[] = [];

      const hook: CacheInvalidationHook = {
        name: 'test-hook',
        onCommit: async (event) => {
          hookCalls.push(event);
          return { success: true, invalidatedPaths: event.affectedPaths };
        },
      };

      const event: CDCCommitEvent = {
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/block.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      };

      const result = await hook.onCommit(event);

      expect(hookCalls).toHaveLength(1);
      expect(hookCalls[0]).toEqual(event);
      expect(result.success).toBe(true);
      expect(result.invalidatedPaths).toHaveLength(1);
    });

    it('should support optional filter predicate', async () => {
      const hook: CacheInvalidationHook = {
        name: 'filtered-hook',
        filter: (event) => event.table === 'orders',
        onCommit: async (event) => ({
          success: true,
          invalidatedPaths: event.affectedPaths,
        }),
      };

      expect(hook.filter).toBeDefined();
      expect(hook.filter!({ table: 'orders' } as CDCCommitEvent)).toBe(true);
      expect(hook.filter!({ table: 'users' } as CDCCommitEvent)).toBe(false);
    });

    it('should support optional priority for hook ordering', async () => {
      const highPriorityHook: CacheInvalidationHook = {
        name: 'high-priority',
        priority: 100,
        onCommit: async () => ({ success: true, invalidatedPaths: [] }),
      };

      const lowPriorityHook: CacheInvalidationHook = {
        name: 'low-priority',
        priority: 10,
        onCommit: async () => ({ success: true, invalidatedPaths: [] }),
      };

      expect(highPriorityHook.priority).toBe(100);
      expect(lowPriorityHook.priority).toBe(10);
    });
  });

  describe('CacheInvalidationManager', () => {
    it('should create manager with default configuration', () => {
      const manager = createCacheInvalidationManager();

      expect(manager).toBeDefined();
      expect(manager.getHooks()).toHaveLength(0);
    });

    it('should register and unregister hooks', () => {
      const manager = createCacheInvalidationManager();

      const hook: CacheInvalidationHook = {
        name: 'test-hook',
        onCommit: async () => ({ success: true, invalidatedPaths: [] }),
      };

      manager.registerHook(hook);
      expect(manager.getHooks()).toHaveLength(1);

      manager.unregisterHook('test-hook');
      expect(manager.getHooks()).toHaveLength(0);
    });

    it('should execute hooks on commit event', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/block.parquet', {
        status: 200,
        headers: new Headers(),
      });
      setFetchFunction(createMockFetch(mockResponses));

      const manager = createCacheInvalidationManager();
      const hookCalls: CDCCommitEvent[] = [];

      manager.registerHook({
        name: 'tracking-hook',
        onCommit: async (event) => {
          hookCalls.push(event);
          return { success: true, invalidatedPaths: event.affectedPaths };
        },
      });

      const event: CDCCommitEvent = {
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/block.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      };

      const result = await manager.onCommit(event);

      expect(hookCalls).toHaveLength(1);
      expect(result.success).toBe(true);
    });

    it('should execute hooks in priority order', async () => {
      const manager = createCacheInvalidationManager();
      const executionOrder: string[] = [];

      manager.registerHook({
        name: 'low-priority',
        priority: 10,
        onCommit: async () => {
          executionOrder.push('low');
          return { success: true, invalidatedPaths: [] };
        },
      });

      manager.registerHook({
        name: 'high-priority',
        priority: 100,
        onCommit: async () => {
          executionOrder.push('high');
          return { success: true, invalidatedPaths: [] };
        },
      });

      manager.registerHook({
        name: 'medium-priority',
        priority: 50,
        onCommit: async () => {
          executionOrder.push('medium');
          return { success: true, invalidatedPaths: [] };
        },
      });

      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: [],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(executionOrder).toEqual(['high', 'medium', 'low']);
    });

    it('should respect hook filters', async () => {
      const manager = createCacheInvalidationManager();
      const hookCalls: string[] = [];

      manager.registerHook({
        name: 'orders-only',
        filter: (event) => event.table === 'orders',
        onCommit: async () => {
          hookCalls.push('orders-hook');
          return { success: true, invalidatedPaths: [] };
        },
      });

      manager.registerHook({
        name: 'all-tables',
        onCommit: async () => {
          hookCalls.push('all-hook');
          return { success: true, invalidatedPaths: [] };
        },
      });

      // Trigger for users table
      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: [],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(hookCalls).toEqual(['all-hook']);
      hookCalls.length = 0;

      // Trigger for orders table
      await manager.onCommit({
        table: 'orders',
        partition: 'year=2024',
        snapshotId: 'snap_002',
        affectedPaths: [],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(hookCalls).toEqual(['orders-hook', 'all-hook']);
    });

    it('should aggregate results from multiple hooks', async () => {
      const manager = createCacheInvalidationManager();

      manager.registerHook({
        name: 'hook-1',
        onCommit: async () => ({
          success: true,
          invalidatedPaths: ['path1', 'path2'],
        }),
      });

      manager.registerHook({
        name: 'hook-2',
        onCommit: async () => ({
          success: true,
          invalidatedPaths: ['path3'],
        }),
      });

      const result = await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: [],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(result.success).toBe(true);
      expect(result.invalidatedPaths).toContain('path1');
      expect(result.invalidatedPaths).toContain('path2');
      expect(result.invalidatedPaths).toContain('path3');
      expect(result.hookResults).toHaveLength(2);
    });

    it('should continue execution if one hook fails', async () => {
      const manager = createCacheInvalidationManager();
      const hookCalls: string[] = [];

      manager.registerHook({
        name: 'failing-hook',
        priority: 100,
        onCommit: async () => {
          hookCalls.push('failing');
          throw new Error('Hook failed');
        },
      });

      manager.registerHook({
        name: 'succeeding-hook',
        priority: 50,
        onCommit: async () => {
          hookCalls.push('succeeding');
          return { success: true, invalidatedPaths: ['path1'] };
        },
      });

      const result = await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: [],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(hookCalls).toEqual(['failing', 'succeeding']);
      expect(result.success).toBe(false); // Overall failure due to one hook failing
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].hookName).toBe('failing-hook');
      expect(result.invalidatedPaths).toContain('path1');
    });
  });

  describe('Invalidation on Write', () => {
    it('should invalidate affected paths on write commit', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      // Mock PURGE responses for affected paths
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/year=2024/block_001.parquet', {
        status: 200,
        headers: new Headers(),
      });
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/year=2024/block_002.parquet', {
        status: 200,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const manager = createCacheInvalidationManager({
        strategy: 'eager',
      });

      // Register the default path invalidation hook
      manager.registerDefaultInvalidationHook();

      const result = await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: [
          'data/users/year=2024/block_001.parquet',
          'data/users/year=2024/block_002.parquet',
        ],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(result.success).toBe(true);
      expect(result.invalidatedPaths).toHaveLength(2);
    });

    it('should handle partial invalidation failures gracefully', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      // First path succeeds
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/block_001.parquet', {
        status: 200,
        headers: new Headers(),
      });

      // Second path fails
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/block_002.parquet', {
        status: 500,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const manager = createCacheInvalidationManager({
        strategy: 'eager',
      });

      manager.registerDefaultInvalidationHook();

      const result = await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: [
          'data/users/block_001.parquet',
          'data/users/block_002.parquet',
        ],
        timestamp: Date.now(),
        operation: 'write',
      });

      // Should still be considered partial success
      expect(result.invalidatedPaths).toContain('data/users/block_001.parquet');
      expect(result.failedPaths).toContain('data/users/block_002.parquet');
    });
  });

  describe('Partition-Level Invalidation', () => {
    it('should invalidate all cached partitions for a table partition', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      // Mock table-level purge
      mockResponses.set('POST:https://cdn.workers.do/purge', {
        status: 200,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const manager = createCacheInvalidationManager({
        strategy: 'partition',
      });

      manager.registerPartitionInvalidationHook();

      const result = await manager.onCommit({
        table: 'users',
        partition: 'year=2024/month=01',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/year=2024/month=01/block.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(result.success).toBe(true);
      expect(result.scope).toEqual({
        level: 'partition',
        table: 'users',
        partition: 'year=2024/month=01',
      });
    });

    it('should use cache tags for efficient partition invalidation', async () => {
      const capturedRequests: { url: string; body: string }[] = [];

      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        if (init?.method === 'POST') {
          capturedRequests.push({
            url,
            body: init.body as string,
          });
        }
        return new Response(null, { status: 200 });
      };

      setFetchFunction(mockFetch);

      const manager = createCacheInvalidationManager({
        strategy: 'partition',
      });

      manager.registerPartitionInvalidationHook();

      await manager.onCommit({
        table: 'users',
        partition: 'year=2024/month=01',
        snapshotId: 'snap_001',
        affectedPaths: [],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0].url).toContain('/purge');

      const body = JSON.parse(capturedRequests[0].body);
      expect(body.tags).toContain('evodb:users:year=2024/month=01');
    });
  });

  describe('CDC Pipeline Integration', () => {
    it('should integrate with writer flush events', async () => {
      const manager = createCacheInvalidationManager();
      const events: CDCCommitEvent[] = [];

      manager.registerHook({
        name: 'event-collector',
        onCommit: async (event) => {
          events.push(event);
          return { success: true, invalidatedPaths: [] };
        },
      });

      // Simulate writer flush event creating a commit
      const flushResult = {
        status: 'persisted' as const,
        block: {
          id: 'block_001',
          r2Key: 'data/users/year=2024/block_001.parquet',
          rowCount: 1000,
          sizeBytes: 50000,
          minLsn: BigInt(1),
          maxLsn: BigInt(1000),
          createdAt: Date.now(),
          compacted: false,
        },
        entryCount: 1000,
        durationMs: 50,
      };

      // Convert flush result to CDC commit event
      const commitEvent = manager.createCommitEventFromFlush(
        'users',
        'year=2024',
        flushResult
      );

      await manager.onCommit(commitEvent);

      expect(events).toHaveLength(1);
      expect(events[0].table).toBe('users');
      expect(events[0].affectedPaths).toContain('data/users/year=2024/block_001.parquet');
      expect(events[0].metadata?.rowCount).toBe(1000);
    });

    it('should integrate with compaction events', async () => {
      const manager = createCacheInvalidationManager();
      const events: CDCCommitEvent[] = [];

      manager.registerHook({
        name: 'event-collector',
        onCommit: async (event) => {
          events.push(event);
          return { success: true, invalidatedPaths: [] };
        },
      });

      // Simulate compaction result
      const compactResult = {
        status: 'completed' as const,
        blocksMerged: 4,
        newBlock: {
          id: 'compact_001',
          r2Key: 'data/users/year=2024/compact_001.parquet',
          rowCount: 4000,
          sizeBytes: 200000,
          minLsn: BigInt(1),
          maxLsn: BigInt(4000),
          createdAt: Date.now(),
          compacted: true,
        },
        blocksDeleted: [
          'data/users/year=2024/block_001.parquet',
          'data/users/year=2024/block_002.parquet',
          'data/users/year=2024/block_003.parquet',
          'data/users/year=2024/block_004.parquet',
        ],
        durationMs: 200,
      };

      // Convert compaction result to CDC commit event
      const commitEvent = manager.createCommitEventFromCompaction(
        'users',
        'year=2024',
        compactResult
      );

      await manager.onCommit(commitEvent);

      expect(events).toHaveLength(1);
      expect(events[0].operation).toBe('compact');
      // Should include both new block and deleted blocks for invalidation
      expect(events[0].affectedPaths).toContain('data/users/year=2024/compact_001.parquet');
      expect(events[0].affectedPaths).toContain('data/users/year=2024/block_001.parquet');
    });

    it('should support batch commit events', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();

      // Mock PURGE responses for individual paths (used by defaultInvalidationHook)
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/year=2024/month=01/block_001.parquet', {
        status: 200,
        headers: new Headers(),
      });
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/year=2024/month=02/block_001.parquet', {
        status: 200,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const manager = createCacheInvalidationManager();
      manager.registerDefaultInvalidationHook();

      const events: CDCCommitEvent[] = [
        {
          table: 'users',
          partition: 'year=2024/month=01',
          snapshotId: 'snap_001',
          affectedPaths: ['data/users/year=2024/month=01/block_001.parquet'],
          timestamp: Date.now(),
          operation: 'write',
        },
        {
          table: 'users',
          partition: 'year=2024/month=02',
          snapshotId: 'snap_002',
          affectedPaths: ['data/users/year=2024/month=02/block_001.parquet'],
          timestamp: Date.now(),
          operation: 'write',
        },
      ];

      const results = await manager.onCommitBatch(events);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('InvalidationStrategy', () => {
    it('should support eager strategy (invalidate immediately)', async () => {
      const manager = createCacheInvalidationManager({
        strategy: 'eager',
      });

      expect(manager.getStrategy()).toBe('eager');
    });

    it('should support lazy strategy (batch invalidations)', async () => {
      const manager = createCacheInvalidationManager({
        strategy: 'lazy',
        batchWindow: 1000, // 1 second batch window
      });

      expect(manager.getStrategy()).toBe('lazy');
      expect(manager.getBatchWindow()).toBe(1000);
    });

    it('should support partition strategy (invalidate by partition tag)', async () => {
      const manager = createCacheInvalidationManager({
        strategy: 'partition',
      });

      expect(manager.getStrategy()).toBe('partition');
    });

    it('should flush pending invalidations with lazy strategy', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/block_001.parquet', {
        status: 200,
        headers: new Headers(),
      });
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/block_002.parquet', {
        status: 200,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const manager = createCacheInvalidationManager({
        strategy: 'lazy',
        batchWindow: 5000,
      });

      manager.registerDefaultInvalidationHook();

      // Queue multiple events
      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/block_001.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_002',
        affectedPaths: ['data/users/block_002.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      // Force flush
      const result = await manager.flushPendingInvalidations();

      expect(result.invalidatedPaths).toContain('data/users/block_001.parquet');
      expect(result.invalidatedPaths).toContain('data/users/block_002.parquet');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track invalidation statistics', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/block.parquet', {
        status: 200,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const manager = createCacheInvalidationManager();
      manager.registerDefaultInvalidationHook();

      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/block.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      const stats = manager.getStats();

      expect(stats.totalCommits).toBe(1);
      expect(stats.totalInvalidations).toBe(1);
      expect(stats.successfulInvalidations).toBe(1);
      expect(stats.failedInvalidations).toBe(0);
    });

    it('should track errors and failures', async () => {
      const mockResponses = new Map<string, { status: number; headers: Headers }>();
      mockResponses.set('PURGE:https://cdn.workers.do/data/users/block.parquet', {
        status: 500,
        headers: new Headers(),
      });

      setFetchFunction(createMockFetch(mockResponses));

      const manager = createCacheInvalidationManager();
      manager.registerDefaultInvalidationHook();

      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/block.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      const stats = manager.getStats();

      expect(stats.failedInvalidations).toBe(1);
    });

    it('should reset statistics', async () => {
      const manager = createCacheInvalidationManager();

      manager.registerHook({
        name: 'dummy',
        onCommit: async () => ({ success: true, invalidatedPaths: ['path'] }),
      });

      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: [],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(manager.getStats().totalCommits).toBe(1);

      manager.resetStats();

      expect(manager.getStats().totalCommits).toBe(0);
    });
  });

  describe('Versioned Cache Keys (Stale Data Prevention)', () => {
    /**
     * TDD: Red phase - These tests expose the stale cache problem
     *
     * The gap: When Writer DO flushes new blocks, Cache API may serve stale data
     * for 1-5 minutes. We need explicit invalidation or versioned cache keys.
     */

    it('should generate versioned cache keys that include snapshot ID', () => {
      const manager = createCacheInvalidationManager();

      // Generate versioned cache key for a block
      const path = 'data/users/year=2024/block_001.parquet';
      const snapshotId = 'snap_001';

      const versionedKey = manager.generateVersionedCacheKey(path, snapshotId);

      // Key should include snapshot version to prevent stale reads
      expect(versionedKey).toContain(snapshotId);
      expect(versionedKey).toContain(path);
      // Should be in format: path?v=snapshotId or similar
      expect(versionedKey).toMatch(/[?&]v=snap_001/);
    });

    it('should generate different keys for different snapshot versions', () => {
      const manager = createCacheInvalidationManager();

      const path = 'data/users/year=2024/block_001.parquet';

      const key1 = manager.generateVersionedCacheKey(path, 'snap_001');
      const key2 = manager.generateVersionedCacheKey(path, 'snap_002');

      // Different snapshots should produce different cache keys
      expect(key1).not.toBe(key2);
    });

    it('should track current snapshot version per table/partition', () => {
      const manager = createCacheInvalidationManager();

      // Initially no snapshot version
      expect(manager.getCurrentSnapshotVersion('users', 'year=2024')).toBeUndefined();

      // After commit, should track the new snapshot version
      manager.updateSnapshotVersion('users', 'year=2024', 'snap_001');
      expect(manager.getCurrentSnapshotVersion('users', 'year=2024')).toBe('snap_001');

      // Update to new version
      manager.updateSnapshotVersion('users', 'year=2024', 'snap_002');
      expect(manager.getCurrentSnapshotVersion('users', 'year=2024')).toBe('snap_002');
    });

    it('should automatically update snapshot version on commit', async () => {
      const manager = createCacheInvalidationManager();

      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/year=2024/block_001.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(manager.getCurrentSnapshotVersion('users', 'year=2024')).toBe('snap_001');

      // Second commit updates version
      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_002',
        affectedPaths: ['data/users/year=2024/block_002.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      expect(manager.getCurrentSnapshotVersion('users', 'year=2024')).toBe('snap_002');
    });

    it('should provide cache key factory that uses current snapshot version', () => {
      const manager = createCacheInvalidationManager();

      // Set current snapshot version
      manager.updateSnapshotVersion('users', 'year=2024', 'snap_001');

      // Factory should generate keys with current version
      const factory = manager.createCacheKeyFactory('users', 'year=2024');
      const key = factory('data/users/year=2024/block_001.parquet');

      expect(key).toContain('snap_001');
    });

    it('should return invalidation result with new cache key hints', async () => {
      const manager = createCacheInvalidationManager();

      manager.registerHook({
        name: 'test-hook',
        onCommit: async (event) => ({
          success: true,
          invalidatedPaths: event.affectedPaths,
        }),
      });

      const result = await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/year=2024/block_001.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      // Result should include the new versioned cache keys for callers to use
      expect(result.versionedCacheKeys).toBeDefined();
      expect(result.versionedCacheKeys!['data/users/year=2024/block_001.parquet']).toContain('snap_001');
    });

    it('should support getting all versioned keys for a commit event', () => {
      const manager = createCacheInvalidationManager();

      const event: CDCCommitEvent = {
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: [
          'data/users/year=2024/block_001.parquet',
          'data/users/year=2024/block_002.parquet',
        ],
        timestamp: Date.now(),
        operation: 'write',
      };

      const versionedKeys = manager.getVersionedCacheKeysForEvent(event);

      expect(Object.keys(versionedKeys)).toHaveLength(2);
      expect(versionedKeys['data/users/year=2024/block_001.parquet']).toContain('snap_001');
      expect(versionedKeys['data/users/year=2024/block_002.parquet']).toContain('snap_001');
    });

    it('should prevent stale reads by invalidating old keys on new writes', async () => {
      const invalidatedPaths: string[] = [];
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        if (init?.method === 'PURGE') {
          invalidatedPaths.push(url);
        }
        return new Response(null, { status: 200 });
      };
      setFetchFunction(mockFetch);

      const manager = createCacheInvalidationManager();
      manager.registerDefaultInvalidationHook();

      // First write
      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/year=2024/block_001.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      // Clear tracking
      invalidatedPaths.length = 0;

      // Second write to same block (update scenario)
      await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_002',
        affectedPaths: ['data/users/year=2024/block_001.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      // Should invalidate both old versioned key and new path
      // This ensures readers using old snapshot version get cache miss
      expect(invalidatedPaths.length).toBeGreaterThanOrEqual(1);
    });

    it('should export snapshot version in commit event result for reader coordination', async () => {
      const manager = createCacheInvalidationManager();

      manager.registerHook({
        name: 'test-hook',
        onCommit: async (event) => ({
          success: true,
          invalidatedPaths: event.affectedPaths,
        }),
      });

      const result = await manager.onCommit({
        table: 'users',
        partition: 'year=2024',
        snapshotId: 'snap_001',
        affectedPaths: ['data/users/year=2024/block_001.parquet'],
        timestamp: Date.now(),
        operation: 'write',
      });

      // Result should include snapshot info for readers to update their cache keys
      expect(result.snapshotVersion).toBe('snap_001');
      expect(result.table).toBe('users');
      expect(result.partition).toBe('year=2024');
    });
  });
});
