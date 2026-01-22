/**
 * Streaming Query Executor Tests
 *
 * Tests for the integration of streaming capabilities with the QueryExecutor interface.
 * This enables true streaming for large query result sets via the unified executor API.
 *
 * Issue: evodb-lh2l - TDD: Implement true streaming for large result sets
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createStreamingQueryExecutor,
  type StreamingQueryExecutorConfig,
} from '../streaming-executor.js';
import {
  type ExecutorQuery,
  type StreamingQueryExecutor,
  type StreamingExecutorResult,
  isStreamingExecutor,
} from '../query-executor.js';
import {
  StreamingCancelledError,
  type StreamingStats,
} from '../streaming.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create mock data for testing
 */
function createMockData(count: number): Array<{ id: number; name: string; value: number }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `row-${i}`,
    value: i * 10,
  }));
}

/**
 * Create a mock data reader that simulates partition-based reading
 */
function createMockDataReader<T>(
  data: T[],
  options: { delay?: number; failAtOffset?: number } = {}
): (offset: number, limit: number) => Promise<T[] | null> {
  const { delay = 0, failAtOffset } = options;

  return async (offset: number, limit: number): Promise<T[] | null> => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (failAtOffset !== undefined && offset >= failAtOffset) {
      throw new Error(`Read failed at offset ${offset}`);
    }

    if (offset >= data.length) {
      return null;
    }

    return data.slice(offset, offset + limit);
  };
}

// =============================================================================
// StreamingQueryExecutor Tests
// =============================================================================

describe('StreamingQueryExecutor', () => {
  describe('Factory and Type Guards', () => {
    it('should create a streaming executor', () => {
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader([]),
      });

      expect(executor).toBeDefined();
      expect(typeof executor.execute).toBe('function');
      expect(typeof executor.explain).toBe('function');
      expect(typeof executor.executeStream).toBe('function');
    });

    it('should pass isStreamingExecutor type guard', () => {
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader([]),
      });

      expect(isStreamingExecutor(executor)).toBe(true);
    });
  });

  describe('executeStream - Basic Iteration', () => {
    it('should stream results using async iterator', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
      };

      const result = await executor.executeStream(query);

      const rows: typeof data = [];
      for await (const row of result.rows) {
        rows.push(row as typeof data[0]);
      }

      expect(rows.length).toBe(100);
      expect(rows[0]).toEqual({ id: 0, name: 'row-0', value: 0 });
      expect(rows[99]).toEqual({ id: 99, name: 'row-99', value: 990 });
    });

    it('should handle empty results', async () => {
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader([]),
      });

      const query: ExecutorQuery = {
        table: 'test',
      };

      const result = await executor.executeStream(query);

      const rows: unknown[] = [];
      for await (const row of result.rows) {
        rows.push(row);
      }

      expect(rows.length).toBe(0);
    });

    it('should provide stats after streaming completes', async () => {
      const data = createMockData(50);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 10,
      });

      const query: ExecutorQuery = {
        table: 'test',
      };

      const result = await executor.executeStream(query);

      // Consume all rows
      for await (const _ of result.rows) {
        // consume
      }

      const stats = await result.getStats();

      expect(stats.rowsReturned).toBe(50);
      expect(stats.executionTimeMs).toBeGreaterThan(0);
    });
  });

  describe('executeStream - Filtering', () => {
    it('should apply predicates during streaming', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
        predicates: [{ column: 'value', operator: 'gte', value: 500 }],
      };

      const result = await executor.executeStream(query);

      const rows: typeof data = [];
      for await (const row of result.rows) {
        rows.push(row as typeof data[0]);
      }

      // Only rows with value >= 500 (i.e., id >= 50)
      expect(rows.length).toBe(50);
      expect(rows.every(r => r.value >= 500)).toBe(true);
    });

    it('should apply multiple predicates', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
        predicates: [
          { column: 'value', operator: 'gte', value: 200 },
          { column: 'value', operator: 'lt', value: 500 },
        ],
      };

      const result = await executor.executeStream(query);

      const rows: typeof data = [];
      for await (const row of result.rows) {
        rows.push(row as typeof data[0]);
      }

      // Rows with 200 <= value < 500 (i.e., 20 <= id < 50)
      expect(rows.length).toBe(30);
      expect(rows.every(r => r.value >= 200 && r.value < 500)).toBe(true);
    });
  });

  describe('executeStream - Projection', () => {
    it('should project specified columns', async () => {
      const data = createMockData(10);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
      });

      const query: ExecutorQuery = {
        table: 'test',
        columns: ['id', 'name'],
      };

      const result = await executor.executeStream(query);

      const rows: Array<{ id: number; name: string }> = [];
      for await (const row of result.rows) {
        rows.push(row as { id: number; name: string });
      }

      expect(rows.length).toBe(10);
      // Should only have id and name properties
      expect(Object.keys(rows[0]).sort()).toEqual(['id', 'name']);
      expect(rows[0]).toEqual({ id: 0, name: 'row-0' });
    });
  });

  describe('executeStream - Limit and Offset', () => {
    it('should apply limit', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
        limit: 25,
      };

      const result = await executor.executeStream(query);

      const rows: unknown[] = [];
      for await (const row of result.rows) {
        rows.push(row);
      }

      expect(rows.length).toBe(25);
    });

    it('should apply offset', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
        offset: 80,
      };

      const result = await executor.executeStream(query);

      const rows: typeof data = [];
      for await (const row of result.rows) {
        rows.push(row as typeof data[0]);
      }

      expect(rows.length).toBe(20);
      expect(rows[0].id).toBe(80);
    });

    it('should apply both limit and offset', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
        offset: 30,
        limit: 10,
      };

      const result = await executor.executeStream(query);

      const rows: typeof data = [];
      for await (const row of result.rows) {
        rows.push(row as typeof data[0]);
      }

      expect(rows.length).toBe(10);
      expect(rows[0].id).toBe(30);
      expect(rows[9].id).toBe(39);
    });
  });

  describe('executeStream - Cancellation', () => {
    it('should support cancellation via cancel()', async () => {
      const data = createMockData(1000);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data, { delay: 5 }),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
      };

      const result = await executor.executeStream(query);

      const rows: unknown[] = [];
      for await (const row of result.rows) {
        rows.push(row);
        if (rows.length >= 50) {
          await result.cancel();
          break;
        }
      }

      expect(rows.length).toBe(50);
      expect(result.isRunning()).toBe(false);
    });

    it('should track isRunning state correctly', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
      };

      const result = await executor.executeStream(query);

      expect(result.isRunning()).toBe(true);

      // Consume all rows
      for await (const _ of result.rows) {
        // consume
      }

      expect(result.isRunning()).toBe(false);
    });
  });

  describe('executeStream - Backpressure', () => {
    it('should handle backpressure with slow consumer', async () => {
      const data = createMockData(50);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 10,
        bufferLimit: 20,
        highWaterMark: 15,
        lowWaterMark: 5,
      });

      const query: ExecutorQuery = {
        table: 'test',
      };

      const result = await executor.executeStream(query);

      const rows: unknown[] = [];
      for await (const row of result.rows) {
        rows.push(row);
        // Slow consumer
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      expect(rows.length).toBe(50);

      const stats = await result.getStats();
      // Backpressure should have been applied
      expect(stats).toBeDefined();
    });
  });

  describe('executeStream - Error Handling', () => {
    it('should propagate read errors', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data, { failAtOffset: 30 }),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
      };

      const result = await executor.executeStream(query);

      const rows: unknown[] = [];

      await expect(async () => {
        for await (const row of result.rows) {
          rows.push(row);
        }
      }).rejects.toThrow('Read failed at offset');

      // Should have received some rows before error
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(100);
    });
  });

  describe('execute - Non-streaming fallback', () => {
    it('should execute query and return complete results', async () => {
      const data = createMockData(50);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
        batchSize: 20,
      });

      const query: ExecutorQuery = {
        table: 'test',
        limit: 10,
      };

      const result = await executor.execute(query);

      expect(result.rows.length).toBe(10);
      expect(result.stats.executionTimeMs).toBeGreaterThan(0);
      expect(result.stats.rowsReturned).toBe(10);
    });

    it('should apply all query options in non-streaming mode', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
      });

      const query: ExecutorQuery = {
        table: 'test',
        predicates: [{ column: 'value', operator: 'lt', value: 200 }],
        columns: ['id', 'value'],
        offset: 5,
        limit: 10,
      };

      const result = await executor.execute(query);

      expect(result.rows.length).toBe(10);
      expect((result.rows[0] as any).id).toBe(5);
      expect(Object.keys(result.rows[0]).sort()).toEqual(['id', 'value']);
    });
  });

  describe('explain', () => {
    it('should return execution plan', async () => {
      const data = createMockData(100);
      const executor = createStreamingQueryExecutor({
        dataReader: createMockDataReader(data),
      });

      const query: ExecutorQuery = {
        table: 'test',
        predicates: [{ column: 'value', operator: 'gte', value: 500 }],
        limit: 50,
      };

      const plan = await executor.explain(query);

      expect(plan.query).toEqual(query);
      expect(plan.planId).toBeDefined();
      expect(plan.estimatedCost).toBeDefined();
      expect(plan.createdAt).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('StreamingQueryExecutor Integration', () => {
  it('should integrate with partition-based data sources', async () => {
    // Simulates reading from multiple partitions
    const partitions = [
      createMockData(30),  // partition 0
      createMockData(30).map(r => ({ ...r, id: r.id + 30 })),  // partition 1
      createMockData(40).map(r => ({ ...r, id: r.id + 60 })),  // partition 2
    ];

    let currentPartition = 0;
    let currentOffset = 0;

    const partitionReader = async (offset: number, limit: number): Promise<typeof partitions[0] | null> => {
      // Simple partition simulation: once offset exceeds current partition, move to next
      while (currentPartition < partitions.length && currentOffset >= partitions[currentPartition].length) {
        currentPartition++;
        currentOffset = 0;
      }

      if (currentPartition >= partitions.length) {
        return null;
      }

      const partition = partitions[currentPartition];
      const result = partition.slice(currentOffset, currentOffset + limit);
      currentOffset += result.length;

      return result.length > 0 ? result : null;
    };

    const executor = createStreamingQueryExecutor({
      dataReader: partitionReader,
      batchSize: 10,
    });

    const result = await executor.executeStream({ table: 'test' });

    const rows: typeof partitions[0] = [];
    for await (const row of result.rows) {
      rows.push(row as typeof partitions[0][0]);
    }

    // Should get all 100 rows from all partitions
    expect(rows.length).toBe(100);
    expect(rows[0].id).toBe(0);
    expect(rows[99].id).toBe(99);
  });

  it('should handle large result sets memory-efficiently', async () => {
    // Create a large dataset
    const rowCount = 10000;
    let maxBufferedRows = 0;
    let currentBuffered = 0;

    const largeDataReader = async (offset: number, limit: number): Promise<Array<{ id: number }> | null> => {
      if (offset >= rowCount) return null;

      const result = Array.from(
        { length: Math.min(limit, rowCount - offset) },
        (_, i) => ({ id: offset + i })
      );

      currentBuffered += result.length;
      maxBufferedRows = Math.max(maxBufferedRows, currentBuffered);

      return result;
    };

    const executor = createStreamingQueryExecutor({
      dataReader: largeDataReader,
      batchSize: 100,
      bufferLimit: 500,
      highWaterMark: 400,
      lowWaterMark: 100,
    });

    const result = await executor.executeStream({ table: 'test' });

    let consumed = 0;
    for await (const _ of result.rows) {
      consumed++;
      currentBuffered--;
    }

    expect(consumed).toBe(rowCount);
    // Buffer should never have exceeded limit (with some margin for timing)
    expect(maxBufferedRows).toBeLessThan(1000);
  });
});
