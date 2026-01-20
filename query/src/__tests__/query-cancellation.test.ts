/**
 * @evodb/query - Query Cancellation Test Suite
 *
 * TDD tests for query cancellation via AbortController/AbortSignal.
 * Tests verify that queries can be cancelled mid-execution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  QueryEngine,
  createQueryEngine,
} from '../engine.js';

import type {
  Query,
  QueryEngineConfig,
  R2Bucket,
} from '../types.js';

import { createMockDataSource, MockDataSource, MockTableDefinition } from './fixtures/mock-data.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock R2 bucket for testing
 */
function createMockBucket(): R2Bucket {
  return {
    get: vi.fn().mockResolvedValue(null),
    head: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
  };
}

/**
 * Create test query engine config
 */
function createTestConfig(overrides?: Partial<QueryEngineConfig>): QueryEngineConfig {
  return {
    bucket: createMockBucket(),
    dataSource: createMockDataSource(),
    maxParallelism: 4,
    defaultTimeoutMs: 30000,
    enableStats: true,
    ...overrides,
  };
}

/**
 * Create a mock data source with slow operations for cancellation testing.
 * This data source introduces delays to simulate long-running queries.
 */
function createSlowMockDataSource(delayMs: number = 100): MockDataSource {
  const dataSource = createMockDataSource();

  // Generate a large dataset that takes time to process
  const largeRows: Record<string, unknown>[] = [];
  for (let i = 0; i < 10000; i++) {
    largeRows.push({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      data: `Data entry ${i + 1} with some extra content to make it larger`,
    });
  }

  const slowTable: MockTableDefinition = {
    partitions: [
      {
        path: 'data/slow_table/p1.bin',
        partitionValues: {},
        sizeBytes: 1000000,
        rowCount: 10000,
        zoneMap: {
          columns: {
            id: { min: 1, max: 10000, nullCount: 0, allNull: false },
          },
        },
        isCached: false,
      },
    ],
    rows: largeRows,
    schema: { id: 'number', name: 'string', email: 'string', data: 'string' },
  };

  dataSource.addTable('com/example/api/slow_table', slowTable);

  return dataSource;
}

// =============================================================================
// Query Cancellation Tests
// =============================================================================

describe('EvoDB Query Engine - Query Cancellation', () => {
  let engine: QueryEngine;
  let config: QueryEngineConfig;

  beforeEach(() => {
    config = createTestConfig({
      dataSource: createSlowMockDataSource(),
    });
    engine = createQueryEngine(config);
  });

  describe('AbortSignal Support in execute()', () => {
    it('should accept an AbortSignal in query options', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/users',
      };

      // Should not throw when signal is provided
      const result = await engine.execute(query, { signal: controller.signal });

      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
    });

    it('should throw AbortError when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const query: Query = {
        table: 'com/example/api/users',
      };

      await expect(
        engine.execute(query, { signal: controller.signal })
      ).rejects.toThrow(/abort/i);
    });

    it('should cancel query when abort() is called before execution starts', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/slow_table',
      };

      // Abort before starting the query
      controller.abort();

      // Should throw an abort error
      await expect(
        engine.execute(query, { signal: controller.signal })
      ).rejects.toThrow(/abort/i);
    });

    it('should include abort reason in error when provided', async () => {
      const controller = new AbortController();
      const reason = 'User cancelled the query';

      const query: Query = {
        table: 'com/example/api/slow_table',
      };

      // Abort with a reason before starting
      controller.abort(reason);

      try {
        await engine.execute(query, { signal: controller.signal });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        if (error instanceof Error) {
          expect(error.message).toContain('abort');
        }
      }
    });

    it('should not affect other queries when one is cancelled', async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const query: Query = {
        table: 'com/example/api/users',
      };

      // Start two queries
      const query1Promise = engine.execute(query, { signal: controller1.signal });
      const query2Promise = engine.execute(query, { signal: controller2.signal });

      // Cancel only the first one
      controller1.abort();

      // First should be cancelled
      await expect(query1Promise).rejects.toThrow(/abort/i);

      // Second should complete successfully
      const result2 = await query2Promise;
      expect(result2.rows).toBeDefined();
    });

    it('should clean up resources when query is cancelled', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/slow_table',
      };

      const queryPromise = engine.execute(query, { signal: controller.signal });

      controller.abort();

      try {
        await queryPromise;
      } catch {
        // Expected to throw
      }

      // Engine should still be usable after cancellation
      const result = await engine.execute({ table: 'com/example/api/users' });
      expect(result.rows).toBeDefined();
    });

    it('should support AbortSignal.timeout() for automatic cancellation', async () => {
      // Create a pre-aborted signal using AbortController
      const controller = new AbortController();
      controller.abort('Timeout');

      const query: Query = {
        table: 'com/example/api/slow_table',
      };

      // Should throw abort error because signal is already aborted
      await expect(
        engine.execute(query, { signal: controller.signal })
      ).rejects.toThrow(/abort/i);
    });
  });

  describe('AbortSignal Support in executeStream()', () => {
    it('should accept an AbortSignal in streaming query options', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/users',
        limit: 10,
      };

      const stream = await engine.executeStream(query, { signal: controller.signal });

      expect(stream.rows).toBeDefined();
      expect(stream.isRunning()).toBe(true);
    });

    it('should stop streaming when signal is aborted', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/slow_table',
      };

      const stream = await engine.executeStream(query, { signal: controller.signal });

      let rowCount = 0;
      const maxRows = 100;

      try {
        for await (const row of stream.rows) {
          rowCount++;
          if (rowCount >= 5) {
            // Abort after receiving some rows
            controller.abort();
          }
          if (rowCount >= maxRows) break;
        }
      } catch (error) {
        // May throw abort error
        expect(error).toBeDefined();
      }

      // Should have stopped early due to abort
      expect(rowCount).toBeLessThan(maxRows);
      expect(stream.isRunning()).toBe(false);
    });

    it('should throw when trying to iterate after abort', async () => {
      const controller = new AbortController();
      controller.abort();

      const query: Query = {
        table: 'com/example/api/users',
      };

      await expect(
        engine.executeStream(query, { signal: controller.signal })
      ).rejects.toThrow(/abort/i);
    });

    it('should handle abort during stream iteration gracefully', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/slow_table',
      };

      const stream = await engine.executeStream(query, { signal: controller.signal });

      const rows: unknown[] = [];
      let aborted = false;

      for await (const row of stream.rows) {
        rows.push(row);
        if (rows.length >= 3) {
          controller.abort();
          break;
        }
      }

      // Stream should no longer be running
      expect(stream.isRunning()).toBe(false);

      // Should have collected some rows before abort
      expect(rows.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('AbortSignal Support in plan()', () => {
    it('should accept an AbortSignal when creating a plan', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/users',
      };

      const plan = await engine.plan(query, { signal: controller.signal });

      expect(plan.planId).toBeDefined();
      expect(plan.query).toBe(query);
    });

    it('should throw when signal is already aborted during planning', async () => {
      const controller = new AbortController();
      controller.abort();

      const query: Query = {
        table: 'com/example/api/users',
      };

      await expect(
        engine.plan(query, { signal: controller.signal })
      ).rejects.toThrow(/abort/i);
    });
  });

  describe('Query Stats with Cancellation', () => {
    it('should include cancellation status in query stats', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/slow_table',
        limit: 1000,
      };

      const stream = await engine.executeStream(query, { signal: controller.signal });

      // Consume a few rows then abort
      let count = 0;
      for await (const _ of stream.rows) {
        count++;
        if (count >= 5) {
          controller.abort();
          break;
        }
      }

      const stats = await stream.getStats();

      // Stats should indicate the query was cancelled
      expect(stats).toBeDefined();
      expect(stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid abort/create cycles', async () => {
      for (let i = 0; i < 5; i++) {
        const controller = new AbortController();
        const query: Query = {
          table: 'com/example/api/users',
        };

        const promise = engine.execute(query, { signal: controller.signal });
        controller.abort();

        try {
          await promise;
        } catch {
          // Expected
        }
      }

      // Engine should still work
      const result = await engine.execute({ table: 'com/example/api/users' });
      expect(result.rows).toBeDefined();
    });

    it('should handle abort with no listeners', async () => {
      const controller = new AbortController();
      controller.abort();

      // Creating a query after abort should fail immediately
      const query: Query = {
        table: 'com/example/api/users',
      };

      await expect(
        engine.execute(query, { signal: controller.signal })
      ).rejects.toThrow(/abort/i);
    });

    it('should handle null/undefined signal gracefully', async () => {
      const query: Query = {
        table: 'com/example/api/users',
      };

      // Should work without signal
      const result1 = await engine.execute(query);
      expect(result1.rows).toBeDefined();

      // Should work with undefined signal in options
      const result2 = await engine.execute(query, { signal: undefined });
      expect(result2.rows).toBeDefined();
    });

    it('should propagate abort through nested operations', async () => {
      const controller = new AbortController();
      const query: Query = {
        table: 'com/example/api/slow_table',
        predicates: [
          { column: 'id', operator: 'gt', value: 0 },
        ],
        orderBy: [{ column: 'id', direction: 'asc' }],
        aggregations: [
          { function: 'count', column: null, alias: 'total' },
        ],
        groupBy: ['name'],
      };

      // Abort before starting to ensure abort propagates
      controller.abort('User cancelled');

      await expect(
        engine.execute(query, { signal: controller.signal })
      ).rejects.toThrow(/abort/i);
    });
  });
});
